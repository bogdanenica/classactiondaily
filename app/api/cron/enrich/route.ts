import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { newBudget, budgetLeft, fetchComplaintText, OutOfBudget } from '@/app/lib/courtlistener';
import { summarizeFromComplaint, summaryProblems, tidy } from '@/app/lib/caseQuality';
import { unpublish, restore, noteHeldAttempt, setHeldReason } from '@/app/lib/caseHold';
import { generateImagePrompt, generateAndStoreImage, IMAGE_VERSION } from '@/app/lib/imageGen';

// Nightly complaint reader.
//
// Looks for the complaint on CourtListener and, when it is there, rewrites the
// case summary from the complaint itself. It also decides, from the complaint,
// whether the case is a consumer class action at all:
//   - held case, confirmed consumer      -> published
//   - published case, confirmed consumer -> summary replaced
//   - not a consumer class action        -> held (taken off the site if it was on it)
//
// Order of work: recently held cases first (new filings waiting to be
// published), then published cases whose summary is not yet from a complaint.
//
// Manual run (replace KEY with CRON_SECRET):
//   /api/cron/enrich?key=KEY&dry=1&limit=3   preview, writes nothing
//   /api/cron/enrich?key=KEY&id=608          one published case
//   /api/cron/enrich?key=KEY                 tonight's batch now

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

const MAX_REQUESTS = 15;        // CourtListener requests per run
const TIME_BUDGET_MS = 250_000;
const MAX_HELD_ATTEMPTS = 5;
const MAX_CASE_ATTEMPTS = 4;

type Candidate = {
  kind: 'held' | 'case';
  clId: string;
  caseId: number | null;
  caseName: string;
  court: string;
  facts: any;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = searchParams.get('dry') === '1';
  const onlyId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : null;
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '12', 10) || 12, 15));
  const started = Date.now();

  const candidates: Candidate[] = [];
  let waitingHeld = 0;
  let waitingCases = 0;
  try {
    if (onlyId) {
      const rows = await sql`SELECT id, courtlistener_id::text AS cl, case_name, court_name FROM cases WHERE id = ${onlyId}`;
      for (const c of rows) candidates.push({ kind: 'case', clId: c.cl, caseId: c.id, caseName: c.case_name, court: c.court_name, facts: null });
    } else {
      // Held cases waiting on a complaint. Re-tried at widening intervals.
      const held = await sql`
        SELECT courtlistener_id, case_id, case_name, data
        FROM cases_held
        WHERE reason = 'no_info' AND attempts < ${MAX_HELD_ATTEMPTS}
          AND (checked_at IS NULL OR checked_at < now() - make_interval(days => 2 * attempts + 1))
        ORDER BY (case_id IS NULL) DESC, held_at DESC
        LIMIT ${limit}`;
      for (const h of held) {
        candidates.push({ kind: 'held', clId: h.courtlistener_id, caseId: h.case_id ?? null, caseName: h.case_name ?? '', court: h.data?.court_name ?? '', facts: h.data });
      }
      const wh = await sql`SELECT count(*)::int AS n FROM cases_held WHERE reason = 'no_info' AND attempts < ${MAX_HELD_ATTEMPTS}`;
      waitingHeld = wh[0]?.n ?? 0;

      if (candidates.length < limit) {
        const cases = await sql`
          SELECT id, courtlistener_id::text AS cl, case_name, court_name
          FROM cases
          WHERE courtlistener_id IS NOT NULL
            AND summary_source IS DISTINCT FROM 'complaint'
            AND enrich_attempts < ${MAX_CASE_ATTEMPTS}
            AND (enrich_checked_at IS NULL OR enrich_checked_at < now() - make_interval(days => 14 * enrich_attempts))
          ORDER BY enrich_checked_at ASC NULLS FIRST, date_filed DESC
          LIMIT ${limit - candidates.length}`;
        for (const c of cases) candidates.push({ kind: 'case', clId: c.cl, caseId: c.id, caseName: c.case_name, court: c.court_name, facts: null });
      }
      const wc = await sql`
        SELECT count(*)::int AS n FROM cases
        WHERE summary_source IS DISTINCT FROM 'complaint' AND enrich_attempts < ${MAX_CASE_ATTEMPTS}`;
      waitingCases = wc[0]?.n ?? 0;
    }
  } catch (err: any) {
    return NextResponse.json({
      error: 'Could not read the quality columns. Run neon-quality-setup.sql in Neon first.',
      detail: err?.message || String(err),
    }, { status: 500 });
  }

  const budget = newBudget(MAX_REQUESTS);
  const results: any[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  let stopped: string | null = null;

  for (const c of candidates) {
    if (Date.now() - started > TIME_BUDGET_MS) { stopped = 'time budget'; break; }
    if (budgetLeft(budget) < 2) { stopped = 'request cap'; break; }
    const out: any = { kind: c.kind, id: c.caseId, case: c.caseName };
    try {
      const got = await fetchComplaintText(c.clId, budget);
      out.source = got.note;

      if (!got.text) {
        bump('no complaint yet');
        out.action = 'no complaint yet';
        if (!dry) {
          if (c.kind === 'held') await noteHeldAttempt(c.clId, got.note);
          else await sql`UPDATE cases SET enrich_attempts = enrich_attempts + 1, enrich_checked_at = now() WHERE id = ${c.caseId}`;
        }
        results.push(out);
        continue;
      }

      const s = await summarizeFromComplaint({ caseName: c.caseName, court: c.court, complaint: got.text });
      const problem = summaryProblems(s, 'complaint');
      if (problem) {
        bump('summary rejected');
        out.action = `summary rejected: ${problem}`;
        if (!dry) {
          if (c.kind === 'held') await noteHeldAttempt(c.clId, problem);
          else await sql`UPDATE cases SET enrich_attempts = enrich_attempts + 1, enrich_checked_at = now() WHERE id = ${c.caseId}`;
        }
        results.push(out);
        continue;
      }
      const summary = tidy(s.summary);
      out.consumer = s.consumer;
      out.reason = s.reason;
      if (dry) out.summary = summary;

      if (!s.consumer) {
        // Not a consumer class action.
        if (c.kind === 'case') {
          bump('removed: not consumer');
          out.action = 'remove from site (not a consumer class action)';
          if (!dry) {
            const done = await unpublish(c.caseId!, 'not_consumer', s.reason || 'complaint is not a consumer class action');
            if (!done) {
              // Someone submitted a form about it. Keep the page, but make it accurate.
              out.action = 'kept (has form submissions); summary corrected';
              await sql`
                UPDATE cases SET summary = ${summary}, defendant = ${s.defendant}, category = 'Other',
                  allegation_type = 'Other', summary_source = 'complaint', enrich_checked_at = now()
                WHERE id = ${c.caseId}`;
            }
          }
        } else {
          bump('held: not consumer');
          out.action = 'stays off the site (not a consumer class action)';
          if (!dry) await setHeldReason(c.clId, 'not_consumer', s.reason || 'complaint is not a consumer class action');
        }
        results.push(out);
        continue;
      }

      // Confirmed consumer class action, with a summary from the complaint.
      if (c.kind === 'case') {
        bump('summary replaced');
        out.action = 'summary replaced from complaint';
        if (!dry) {
          await sql`
            UPDATE cases SET summary = ${summary}, defendant = ${s.defendant}, category = ${s.category},
              allegation_type = ${s.allegation_type}, summary_source = 'complaint',
              enrich_checked_at = now()
            WHERE id = ${c.caseId}`;
        }
      } else if (c.caseId != null) {
        bump('restored');
        out.action = 'page restored with summary from complaint';
        if (!dry) {
          const id = await restore(c.clId);
          await sql`
            UPDATE cases SET summary = ${summary}, defendant = ${s.defendant}, category = ${s.category},
              allegation_type = ${s.allegation_type}, summary_source = 'complaint', enrich_checked_at = now()
            WHERE id = ${id}`;
        }
      } else {
        bump('published');
        out.action = 'published with summary from complaint';
        if (!dry) {
          const f = c.facts ?? {};
          let imageUrl: string | null = null;
          try {
            const imgPrompt = await generateImagePrompt({
              caseName: c.caseName, defendant: s.defendant, category: s.category, allegation: s.allegation_type, summary,
            });
            imageUrl = await generateAndStoreImage(imgPrompt, `cases/${c.clId}-${IMAGE_VERSION}`);
          } catch (err: any) {
            out.imageError = err?.message || String(err);
          }
          await sql.transaction([
            sql`
              INSERT INTO cases (
                courtlistener_id, docket_number, case_name, court_id, court_name,
                date_filed, defendant, category, allegation_type, summary, raw_complaint_url, image_url,
                summary_source, cause, nature_of_suit, meta_checked_at, enrich_checked_at
              ) VALUES (
                ${f.courtlistener_id ?? c.clId}, ${f.docket_number ?? null}, ${c.caseName}, ${f.court_id ?? null},
                ${f.court_name ?? null}, ${f.date_filed ?? null}, ${s.defendant},
                ${s.category}, ${s.allegation_type}, ${summary}, ${f.raw_complaint_url ?? null}, ${imageUrl},
                'complaint', ${f.cause ?? null}, ${f.nature_of_suit ?? null}, now(), now()
              )`,
            sql`DELETE FROM cases_held WHERE courtlistener_id = ${c.clId}`,
          ]);
        }
      }
      results.push(out);
    } catch (err: any) {
      if (err instanceof OutOfBudget) { stopped = 'request cap'; break; }
      bump('error');
      out.error = err?.message || String(err);
      results.push(out);
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    waiting: { held: waitingHeld, published_without_complaint: waitingCases },
    processed: results.length,
    counts,
    requests: budget.used,
    throttled: budget.throttled,
    stopped,
    seconds: Math.round((Date.now() - started) / 1000),
    results,
  });
}
