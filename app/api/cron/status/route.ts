import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { classifyDocket, FINAL_STATUSES, type DocketEntry } from '@/app/lib/caseStatus';

// Rolling docket re-check. Runs once a day (vercel.json) and checks a small
// batch of open cases, oldest check first, skipping anything checked in the
// last RECHECK_DAYS. Over a year every open case is looked at about twice.
//
// Why a small daily batch: a free CourtListener account allows 5 requests a
// minute, 50 an hour, and 125 a day, shared with the daily ingest, the scout,
// and any research done under the same account. This job is capped at
// MAX_REQUESTS_PER_RUN (well under half the daily allowance) and runs at
// night, U.S. time.
//
// Manual run (replace KEY with CRON_SECRET):
//   /api/cron/status?key=KEY&dry=1&limit=3     preview, writes nothing
//   /api/cron/status?key=KEY                   run today's batch now
//   /api/cron/status?key=KEY&id=613            re-check one case

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

const RECHECK_DAYS = 150;
const MAX_REQUESTS_PER_RUN = 20;   // CourtListener requests, hard cap
const MIN_GAP_MS = 12_500;         // 5 requests a minute, with a little slack
const TIME_BUDGET_MS = 270_000;
const BATCH = 19;                  // 1 metadata request + up to 19 entry requests
const CL = 'https://www.courtlistener.com/api/rest/v4';

type Budget = { used: number; lastCall: number; throttled: number };

class OutOfBudget extends Error {}

async function clGet(url: string, b: Budget): Promise<{ ok: boolean; status: number; data: any }> {
  if (b.used >= MAX_REQUESTS_PER_RUN) throw new OutOfBudget('request cap reached');
  const wait = b.lastCall + MIN_GAP_MS - Date.now();
  if (b.used > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait));
  b.lastCall = Date.now();
  b.used++;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` },
    cache: 'no-store',
  });
  if (res.status === 429) b.throttled++;
  const data = res.ok ? await res.json().catch(() => null) : null;
  return { ok: res.ok, status: res.status, data };
}

/** One search request returns the closing date for a whole batch of dockets. */
async function fetchTerminated(ids: number[], b: Budget): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  if (ids.length === 0) return map;
  const q = `docket_id:(${ids.join(' OR ')})`;
  const r = await clGet(`${CL}/search/?type=d&q=${encodeURIComponent(q)}`, b);
  if (!r.ok) throw new Error(`docket lookup ${r.status}`);
  for (const d of r.data?.results ?? []) {
    if (d?.docket_id != null) map.set(Number(d.docket_id), d.dateTerminated ?? null);
  }
  return map;
}

function entryText(e: any): string {
  const own = String(e?.description ?? '').trim();
  if (own) return own;
  // Many entries carry their text only on the attached documents.
  const docs: any[] = Array.isArray(e?.recap_documents) ? e.recap_documents : [];
  return docs
    .map((d) => String(d?.description || d?.short_description || '').trim())
    .filter(Boolean)
    .join('; ');
}

async function fetchEntriesPage(url: string, b: Budget): Promise<{ entries: DocketEntry[]; next: string | null }> {
  const r = await clGet(url, b);
  // A refused request must never be mistaken for an empty docket.
  if (!r.ok) throw new Error(`docket entries ${r.status}`);
  const entries: DocketEntry[] = (r.data?.results ?? []).map((e: any) => ({ date: e.date_filed ?? null, text: entryText(e) }));
  return { entries, next: r.data?.next ?? null };
}

async function checkOne(c: any, terminated: string | null, b: Budget) {
  const first =
    `${CL}/docket-entries/?docket=${c.courtlistener_id}&order_by=-date_filed&page_size=100` +
    `&fields=date_filed,description,entry_number,recap_documents&omit=recap_documents__plain_text`;
  let { entries, next } = await fetchEntriesPage(first, b);
  let result = classifyDocket(entries, { terminated, filed: c.date_filed });

  // On a very long docket the answer may be on an older page. Only spend
  // another request when the newest 100 entries show nothing from the defendant.
  let pages = 1;
  while (next && pages < 3 && (result.status === 'no_response' || result.status === 'unknown')) {
    const more = await fetchEntriesPage(next, b);
    entries = entries.concat(more.entries);
    next = more.next;
    pages++;
    result = classifyDocket(entries, { terminated, filed: c.date_filed });
  }
  if (next && result.status === 'no_response') {
    result = { status: 'unknown', basis: `more than ${entries.length} entries; older ones not read` };
  }

  const withText = entries.filter((e) => e.text);
  return {
    id: c.id,
    case: c.case_name,
    previous: c.status ?? null,
    status: result.status,
    basis: result.basis,
    terminated,
    entries: entries.length,
    blank: entries.length - withText.length,
    latest: withText
      .slice()
      .sort((x, y) => String(y.date ?? '').localeCompare(String(x.date ?? '')))
      .slice(0, 5)
      .map((e) => `${e.date ?? '?'}: ${e.text.replace(/\s+/g, ' ').slice(0, 110)}`),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = searchParams.get('dry') === '1';
  const onlyId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : null;
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || String(BATCH), 10) || BATCH, BATCH));
  const started = Date.now();

  let candidates: any[];
  let waiting = 0;
  try {
    if (onlyId) {
      candidates = await sql`
        SELECT id, courtlistener_id, case_name, date_filed, status
        FROM cases WHERE id = ${onlyId}`;
    } else {
      candidates = await sql`
        SELECT id, courtlistener_id, case_name, date_filed, status
        FROM cases
        WHERE courtlistener_id IS NOT NULL
          AND (status IS NULL OR NOT (status = ANY(${FINAL_STATUSES})))
          AND (status_checked_at IS NULL OR status_checked_at < now() - make_interval(days => ${RECHECK_DAYS}))
        ORDER BY status_checked_at ASC NULLS FIRST, date_filed ASC
        LIMIT ${limit}`;
      const w = await sql`
        SELECT count(*)::int AS n FROM cases
        WHERE courtlistener_id IS NOT NULL
          AND (status IS NULL OR NOT (status = ANY(${FINAL_STATUSES})))
          AND (status_checked_at IS NULL OR status_checked_at < now() - make_interval(days => ${RECHECK_DAYS}))`;
      waiting = w[0]?.n ?? 0;
    }
  } catch (err: any) {
    return NextResponse.json({
      error: 'Could not read case status columns. Run neon-status-newsletter-setup.sql in Neon first.',
      detail: err?.message || String(err),
    }, { status: 500 });
  }

  const budget: Budget = { used: 0, lastCall: 0, throttled: 0 };
  const results: any[] = [];
  const counts: Record<string, number> = {};
  let updated = 0;
  let errors = 0;
  let processed = 0;
  let stopped: string | null = null;

  let terminatedMap = new Map<number, string | null>();
  try {
    terminatedMap = await fetchTerminated(candidates.map((c) => Number(c.courtlistener_id)), budget);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err), requests: budget.used, throttled: budget.throttled }, { status: 502 });
  }

  for (const c of candidates) {
    if (Date.now() - started > TIME_BUDGET_MS - MIN_GAP_MS) { stopped = 'time budget'; break; }
    const key = Number(c.courtlistener_id);
    if (!terminatedMap.has(key)) {
      // Not in the search index. Leave it for a later run rather than guess.
      errors++;
      results.push({ id: c.id, case: c.case_name, error: 'docket not found in CourtListener search' });
      processed++;
      continue;
    }
    try {
      const r: any = await checkOne(c, terminatedMap.get(key) ?? null, budget);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (!dry) {
        await sql`
          UPDATE cases
          SET status = ${r.status}, status_basis = ${r.basis},
              date_terminated = ${r.terminated}, status_checked_at = now()
          WHERE id = ${c.id}`;
        updated++;
        delete r.latest;
      }
      results.push(r);
    } catch (err: any) {
      if (err instanceof OutOfBudget) { stopped = 'request cap'; break; }
      errors++;
      results.push({ id: c.id, case: c.case_name, error: err?.message || String(err) });
    }
    processed++;
  }

  return NextResponse.json({
    ok: true,
    dry,
    waiting,               // open cases due for a check, before this run
    processed,
    updated,
    errors,
    counts,
    requests: budget.used, // CourtListener requests this run (cap: 20)
    throttled: budget.throttled,
    stopped,
    seconds: Math.round((Date.now() - started) / 1000),
    sample: results,
  });
}
