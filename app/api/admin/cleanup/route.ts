import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { newBudget, fetchDocketMeta, OutOfBudget } from '@/app/lib/courtlistener';
import { screenDocket, hasDocketInfo, looksGuessed, looksGuessedWide, docketNote } from '@/app/lib/caseQuality';
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
  if (searchParams.get('pass') === '2') return secondPass(apply, searchParams.get('rule') === 'all' ? 'all' : 'hedged');
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

// ---------------------------------------------------------------------------
// Second pass. No CourtListener requests: it works from the cause of action
// and nature of suit the first pass already stored.
//
// It looks only at summaries that were written before the quality rules and
// were kept by the first pass (not from a complaint, not a docket note, not
// starred, not added by hand).
//   rule=hedged (default)  act on those whose text contains guessing language
//   rule=all               act on every one of them
// Acting means: not a consumer case -> removed; docket has facts -> replaced by
// the fixed docket note; docket has nothing -> removed until the complaint is read.
//
//   /api/admin/cleanup?key=KEY&pass=2                      preview, shows counts for both rules
//   /api/admin/cleanup?key=KEY&pass=2&apply=1              apply rule "hedged"
//   /api/admin/cleanup?key=KEY&pass=2&apply=1&rule=all     apply rule "all"
// ---------------------------------------------------------------------------
async function secondPass(apply: boolean, rule: 'hedged' | 'all') {
  const started = Date.now();
  let rows: any[];
  try {
    rows = await sql`
      SELECT id, case_name, court_name, date_filed, summary, cause, nature_of_suit
      FROM cases
      WHERE summary_source IS NULL AND curated IS NOT TRUE AND manual IS NOT TRUE
      ORDER BY id`;
  } catch (err: any) {
    return NextResponse.json({ error: 'Run neon-quality-setup.sql and neon-curation-setup.sql in Neon first.', detail: err?.message || String(err) }, { status: 500 });
  }

  const preview = { hedged: { note: 0, remove: 0, untouched: 0 }, all: { note: 0, remove: 0, untouched: 0 } };
  const removed: any[] = [];
  const rewritten: any[] = [];
  const untouched: any[] = [];
  const problems: any[] = [];

  for (const c of rows) {
    const cause = String(c.cause ?? ''), nos = String(c.nature_of_suit ?? '');
    const hedged = looksGuessedWide(c.summary);
    const screen = screenDocket(cause, nos);
    const info = hasDocketInfo(cause, nos);
    const outcome: 'remove' | 'note' = !screen.consumer || !info ? 'remove' : 'note';
    preview.all[outcome]++;
    if (hedged) preview.hedged[outcome]++; else preview.hedged.untouched++;

    const act = rule === 'all' || hedged;
    const line = { id: c.id, case: c.case_name, cause: cause || null, nature_of_suit: nos || null };
    if (!act) { untouched.push({ id: c.id, case: c.case_name }); continue; }
    if (!apply) { (outcome === 'remove' ? removed : rewritten).push({ ...line, result: outcome === 'remove' ? 'would remove' : 'would replace with docket note' }); continue; }

    try {
      if (outcome === 'remove') {
        const why = !screen.consumer ? screen.reason : 'summary was written without the complaint and the docket gives no facts';
        const done = await unpublish(c.id, !screen.consumer ? 'not_consumer' : 'no_info', why);
        removed.push({ ...line, why, result: done ? 'removed' : 'kept (has form submissions)' });
        if (!done) continue;
      } else {
        const note = docketNote({
          court: c.court_name || '',
          dateFiled: String(c.date_filed instanceof Date ? c.date_filed.toISOString() : c.date_filed ?? '').slice(0, 10),
          cause, nos,
        });
        await sql`UPDATE cases SET summary = ${note}, summary_source = 'docket' WHERE id = ${c.id}`;
        rewritten.push({ ...line, result: 'replaced with docket note' });
      }
    } catch (err: any) {
      problems.push({ ...line, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    pass: 2,
    mode: apply ? `APPLIED (rule: ${rule})` : 'PREVIEW ONLY',
    older_summaries_examined: rows.length,
    if_rule_hedged: preview.hedged,
    if_rule_all: preview.all,
    seconds: Math.round((Date.now() - started) / 1000),
    removed,
    rewritten,
    untouched_count: untouched.length,
    untouched: apply ? untouched.slice(0, 50) : untouched,
    problems,
  });
}
