import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { classifyDocket, FINAL_STATUSES, type DocketEntry } from '@/app/lib/caseStatus';

// Twice-yearly docket re-check. Scheduled in vercel.json to run once a day
// during January and July; each run works through as many cases as fit in the
// time budget, oldest check first, and skips anything checked in the last
// RECHECK_DAYS. So by the end of the month every open case has been looked at
// once, and on the remaining days the job finds nothing to do.
//
// Manual run (replace KEY with CRON_SECRET):
//   /api/cron/status?key=KEY&dry=1&limit=5     preview, writes nothing
//   /api/cron/status?key=KEY                   run a batch now
//   /api/cron/status?key=KEY&id=613            re-check one case
//   /api/cron/status?key=KEY&all=1             ignore the "checked recently" rule

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

const RECHECK_DAYS = 150;
const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 2;
const MIN_GAP_MS = 400; // at most ~2.5 requests a second
const MAX_ENTRIES = 200;
const CL = 'https://www.courtlistener.com/api/rest/v4';

function clHeaders(): Record<string, string> {
  return { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` };
}

// CourtListener throttles bursts. Space requests out, and when it answers 429
// wait as long as it asks (Retry-After) before trying again.
let lastCall = 0;
async function pace() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  lastCall = Math.max(Date.now(), lastCall + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function clGet(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  let status = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await pace();
    const res = await fetch(url, { headers: clHeaders(), cache: 'no-store' });
    status = res.status;
    if (res.status === 429 || res.status >= 500) {
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      const waitMs = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * attempt, 20_000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const data = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status, data: null };
}

// Docket entries can come from two places. The docket-entries endpoint is the
// clean one but is not open to every account; the search endpoint is open to
// all. Try the first, fall back to the second, and remember which one worked.
let entriesEndpointAllowed: boolean | null = null;

async function fetchEntries(docketId: number): Promise<{ entries: DocketEntry[]; via: string }> {
  const out: DocketEntry[] = [];

  if (entriesEndpointAllowed !== false) {
    let url: string | null =
      `${CL}/docket-entries/?docket=${docketId}&order_by=-date_filed&page_size=100&fields=date_filed,description,entry_number`;
    let pages = 0;
    while (url && out.length < MAX_ENTRIES && pages < 3) {
      const r = await clGet(url);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) entriesEndpointAllowed = false;
        break;
      }
      entriesEndpointAllowed = true;
      for (const e of r.data?.results ?? []) {
        out.push({ date: e.date_filed ?? null, text: String(e.description ?? '') });
      }
      url = r.data?.next ?? null;
      pages++;
    }
    if (entriesEndpointAllowed) return { entries: out, via: 'docket-entries' };
  }

  let url: string | null =
    `${CL}/search/?type=rd&q=${encodeURIComponent(`docket_id:${docketId}`)}&order_by=${encodeURIComponent('entry_date_filed desc')}`;
  let pages = 0;
  const seen = new Set<string>();
  while (url && out.length < MAX_ENTRIES && pages < 6) {
    const r = await clGet(url);
    if (!r.ok) break;
    for (const d of r.data?.results ?? []) {
      const text = String(d.description || d.short_description || '');
      const date = d.entry_date_filed ?? d.dateFiled ?? null;
      const key = `${d.entry_number ?? ''}|${date}|${text.slice(0, 60)}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push({ date, text });
    }
    url = r.data?.next ?? null;
    pages++;
  }
  return { entries: out, via: 'search' };
}

async function checkOne(c: any) {
  const d = await clGet(`${CL}/dockets/${c.courtlistener_id}/?fields=date_terminated,date_last_filing,date_filed`);
  if (!d.ok) return { id: c.id, error: `docket ${d.status}` };
  const terminated: string | null = d.data?.date_terminated ?? null;
  const { entries, via } = await fetchEntries(Number(c.courtlistener_id));
  const result = classifyDocket(entries, { terminated, filed: c.date_filed });
  return {
    id: c.id,
    case: c.case_name,
    previous: c.status ?? null,
    status: result.status,
    basis: result.basis,
    terminated,
    entries: entries.length,
    via,
    latest: entries
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
  const all = searchParams.get('all') === '1';
  const onlyId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '2000', 10) || 2000, 5000);
  const started = Date.now();

  let candidates: any[];
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
          AND (${all} OR status_checked_at IS NULL OR status_checked_at < now() - make_interval(days => ${RECHECK_DAYS}))
        ORDER BY status_checked_at ASC NULLS FIRST, date_filed ASC
        LIMIT ${limit}`;
    }
  } catch (err: any) {
    return NextResponse.json({
      error: 'Could not read case status columns. Run neon-status-newsletter-setup.sql in Neon first.',
      detail: err?.message || String(err),
    }, { status: 500 });
  }

  const results: any[] = [];
  const counts: Record<string, number> = {};
  let updated = 0;
  let errors = 0;
  let i = 0;

  async function worker() {
    while (i < candidates.length && Date.now() - started < TIME_BUDGET_MS) {
      const c = candidates[i++];
      try {
        const r: any = await checkOne(c);
        if (r.error) { errors++; results.push(r); continue; }
        counts[r.status] = (counts[r.status] ?? 0) + 1;
        if (!dry) {
          await sql`
            UPDATE cases
            SET status = ${r.status}, status_basis = ${r.basis},
                date_terminated = ${r.terminated}, status_checked_at = now()
            WHERE id = ${c.id}`;
          updated++;
        }
        if (!dry) delete r.latest;
        if (dry || results.length < 40) results.push(r);
      } catch (err: any) {
        errors++;
        results.push({ id: c.id, error: err?.message || String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json({
    ok: true,
    dry,
    candidates: candidates.length,
    processed: i,
    remaining: Math.max(candidates.length - i, 0),
    updated,
    errors,
    counts,
    entriesEndpoint: entriesEndpointAllowed === null ? 'not tried' : entriesEndpointAllowed ? 'docket-entries' : 'search fallback',
    seconds: Math.round((Date.now() - started) / 1000),
    sample: results,
  });
}
