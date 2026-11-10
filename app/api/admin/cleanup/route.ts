import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { newBudget, fetchDocketMeta, OutOfBudget } from '@/app/lib/courtlistener';
import { screenDocket, hasDocketInfo, looksGuessed, docketNote } from '@/app/lib/caseQuality';
import { unpublish } from '@/app/lib/caseHold';

// One-time cleanup of pages published before the quality rules existed.
//
// For each case it fetches the docket's cause of action and nature of suit
// (20 cases per CourtListener request) and then:
//   - not a consumer case                      -> page removed (saved in cases_held)
//   - summary was guessed, docket says nothing -> page removed until the complaint is read
//   - summary was guessed, docket has facts    -> summary replaced by a fixed note of those facts
//   - otherwise                                -> kept as is
// The nightly complaint reader later restores removed pages it can confirm.
//
// PREVIEW FIRST. Nothing changes without &apply=1.
//   /api/admin/cleanup?key=KEY                 preview the next 40 cases
//   /api/admin/cleanup?key=KEY&id=608          preview one case
//   /api/admin/cleanup?key=KEY&apply=1         apply to the next 160 cases; reload until "remaining" is 0

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);
const TIME_BUDGET_MS = 240_000;
const CHUNK = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apply = searchParams.get('apply') === '1';
  const onlyId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : null;
  const maxRequests = apply ? 8 : 2;
  const started = Date.now();

  let rows: any[];
  let remaining = 0;
  try {
    rows = onlyId
      ? await sql`SELECT id, courtlistener_id::text AS cl, case_name, court_name, date_filed, summary FROM cases WHERE id = ${onlyId}`
      : await sql`
          SELECT id, courtlistener_id::text AS cl, case_name, court_name, date_filed, summary
          FROM cases
          WHERE meta_checked_at IS NULL AND courtlistener_id IS NOT NULL
          ORDER BY id
          LIMIT ${maxRequests * CHUNK}`;
    const r = await sql`SELECT count(*)::int AS n FROM cases WHERE meta_checked_at IS NULL AND courtlistener_id IS NOT NULL`;
    remaining = r[0]?.n ?? 0;
  } catch (err: any) {
    return NextResponse.json({
      error: 'Could not read the quality columns. Run neon-quality-setup.sql in Neon first.',
      detail: err?.message || String(err),
    }, { status: 500 });
  }

  const budget = newBudget(maxRequests);
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const removed: any[] = [];
  const rewritten: any[] = [];
  const problems: any[] = [];
  let processed = 0;
  let stopped: string | null = null;

  outer:
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    let meta;
    try {
      meta = await fetchDocketMeta(chunk.map((c) => c.cl), budget);
    } catch (err: any) {
      if (err instanceof OutOfBudget) { stopped = 'request cap'; break; }
      problems.push({ error: err?.message || String(err) });
      break;
    }

    for (const c of chunk) {
      if (Date.now() - started > TIME_BUDGET_MS) { stopped = 'time budget'; break outer; }
      const m = meta.get(c.cl) ?? { cause: '', nos: '', terminated: null };
      const guessed = looksGuessed(c.summary);
      const screen = screenDocket(m.cause, m.nos);
      const info = hasDocketInfo(m.cause, m.nos);
      const line = { id: c.id, case: c.case_name, cause: m.cause || null, nature_of_suit: m.nos || null };

      try {
        if (!screen.consumer) {
          bump('remove: not a consumer case');
          let note = 'removed';
          if (apply) {
            const done = await unpublish(c.id, 'not_consumer', screen.reason);
            if (!done) {
              note = 'kept (has form submissions)';
              await sql`UPDATE cases SET cause = ${m.cause}, nature_of_suit = ${m.nos}, meta_checked_at = now() WHERE id = ${c.id}`;
            }
          }
          removed.push({ ...line, why: screen.reason, result: apply ? note : 'would remove' });
        } else if (guessed && !info) {
          bump('remove: guessed summary, no docket facts');
          let note = 'removed';
          if (apply) {
            const done = await unpublish(c.id, 'no_info', 'summary was guessed and the docket has no cause of action or nature of suit');
            if (!done) {
              note = 'kept (has form submissions)';
              await sql`UPDATE cases SET meta_checked_at = now() WHERE id = ${c.id}`;
            }
          }
          removed.push({ ...line, why: 'summary was guessed; docket gives no facts', result: apply ? note : 'would remove' });
        } else if (guessed) {
          bump('rewrite from docket facts');
          if (apply) {
            // No AI here: a fixed note that only repeats the docket's own coding.
            const note = docketNote({
              court: c.court_name || '', dateFiled: String(c.date_filed instanceof Date ? c.date_filed.toISOString() : c.date_filed ?? '').slice(0, 10),
              cause: m.cause, nos: m.nos,
            });
            await sql`
              UPDATE cases SET summary = ${note}, summary_source = 'docket',
                cause = ${m.cause}, nature_of_suit = ${m.nos}, meta_checked_at = now()
              WHERE id = ${c.id}`;
            rewritten.push({ ...line, result: 'rewritten' });
          } else {
            rewritten.push({ ...line, result: 'would rewrite' });
          }
        } else {
          bump('keep');
          if (apply) {
            await sql`UPDATE cases SET cause = ${m.cause}, nature_of_suit = ${m.nos}, meta_checked_at = now() WHERE id = ${c.id}`;
          }
        }
      } catch (err: any) {
        problems.push({ ...line, error: err?.message || String(err) });
      }
      processed++;
    }
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? 'APPLIED' : 'PREVIEW ONLY (add &apply=1 to make these changes)',
    remaining_before_this_run: remaining,
    processed,
    counts,
    requests: budget.used,
    stopped,
    seconds: Math.round((Date.now() - started) / 1000),
    removed,
    rewritten,
    problems,
  });
}
