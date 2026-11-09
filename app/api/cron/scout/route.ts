import { NextResponse } from 'next/server';
import {
  wasSeen, markSeen, seenCount, draftExists, createDraft, notifyDraft, draftWithClaude,
  DRAFT_STYLE_RULES, type DraftFields, type Evidence,
} from '@/app/lib/investigationDrafts';

// Daily "scout" job: proposes new investigations as DRAFTS for attorney review.
//   Part A  — Milberg filing trends on CourtListener (3+ filings, same cause of action, last 30 days)
//   Part B  — new investigation pages on ClassAction.org (via their sitemap)
//
// Runs from vercel.json. Manual trigger (replace KEY with CRON_SECRET):
//   https://www.classactiondaily.com/api/cron/scout?key=KEY
//   ...&part=milberg      run only Part A
//   ...&part=classaction  run only Part B
//   ...&dry=1             analyze and report, but create no drafts and send no email
//
// Settings (optional env vars):
//   WATCH_FIRMS="Milberg,Millberg"   name fragments to match in the firm/attorney/snippet fields
//   SCOUT_WINDOW_DAYS=30
//   SCOUT_MIN_FILINGS=3
//   SCOUT_MAX_DRAFTS=3               per source per run

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WATCH_FIRMS = (process.env.WATCH_FIRMS || 'Milberg,Millberg').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const WINDOW_DAYS = parseInt(process.env.SCOUT_WINDOW_DAYS || '30', 10);
const MIN_FILINGS = parseInt(process.env.SCOUT_MIN_FILINGS || '3', 10);
const MAX_DRAFTS = parseInt(process.env.SCOUT_MAX_DRAFTS || '3', 10);
const TIME_BUDGET_MS = 250_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const part = searchParams.get('part');
  const dry = searchParams.get('dry') === '1';
  const started = Date.now();
  const out: Record<string, unknown> = { ok: true, dry };

  if (!part || part === 'milberg') {
    try { out.milberg = await scoutMilberg(dry, started); }
    catch (err: any) { out.milberg = { error: err?.message || String(err) }; }
  }
  if (!part || part === 'classaction') {
    try { out.classaction = await scoutClassActionOrg(dry, started); }
    catch (err: any) { out.classaction = { error: err?.message || String(err) }; }
  }
  out.seconds = Math.round((Date.now() - started) / 1000);
  return NextResponse.json(out);
}

// ---------------------------------------------------------------------------
// Part A — Milberg filing trends
// ---------------------------------------------------------------------------

type Filing = {
  docket_id: number;
  caseName: string;
  court: string;
  dateFiled: string;
  cause: string;
  suitNature: string;
  parties: string[];
  url: string;
  description: string;
};

function firmMatches(r: any): boolean {
  const firms: string[] = Array.isArray(r.firm) ? r.firm : [];
  // When CourtListener knows the firms of record, trust that list. (Spellings
  // vary — "Milberg, PLLC", "Millberg, Pllc", "MILBERG PLLC Atlanta" — so match
  // on fragments.) This keeps out other firms' cases that merely mention the
  // watched firm somewhere in an exhibit.
  if (firms.length > 0) {
    const hay = firms.join(' ').toLowerCase();
    return WATCH_FIRMS.some((f) => hay.includes(f));
  }
  // No firm data yet (very new dockets): fall back to attorney names and the
  // first docket entry's text.
  const hay = [
    ...(Array.isArray(r.attorney) ? r.attorney : []),
    ...(Array.isArray(r.recap_documents) ? r.recap_documents.slice(0, 2).map((d: any) => `${d.description ?? ''} ${d.snippet ?? ''}`) : []),
  ].join(' ').toLowerCase();
  return WATCH_FIRMS.some((f) => hay.includes(f));
}

async function fetchWatchedFilings(): Promise<Filing[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().split('T')[0];
  const firmQuery = WATCH_FIRMS.map((f) => `"${f}"`).join(' OR ');
  let url: string | null = (() => {
    const u = new URL('https://www.courtlistener.com/api/rest/v4/search/');
    u.searchParams.set('type', 'r');
    u.searchParams.set('q', `"class action" AND (${firmQuery})`);
    u.searchParams.set('filed_after', since);
    u.searchParams.set('order_by', 'dateFiled desc');
    return u.toString();
  })();

  const filings: Filing[] = [];
  const seen = new Set<number>();
  for (let page = 0; url && page < 3; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` } });
    if (!res.ok) throw new Error(`CourtListener ${res.status}`);
    const data: any = await res.json();
    for (const r of data.results ?? []) {
      if (!r.docket_id || seen.has(r.docket_id)) continue;
      if (!firmMatches(r)) continue;
      seen.add(r.docket_id);
      const firstDoc = Array.isArray(r.recap_documents) ? r.recap_documents[0] : null;
      filings.push({
        docket_id: r.docket_id,
        caseName: r.caseName || '',
        court: r.court || '',
        dateFiled: r.dateFiled || '',
        cause: (r.cause || '').trim(),
        suitNature: (r.suitNature || '').trim(),
        parties: Array.isArray(r.party) ? r.party : [],
        url: r.docket_absolute_url ? `https://www.courtlistener.com${r.docket_absolute_url}` : '',
        description: (firstDoc?.description || '').slice(0, 300),
      });
    }
    url = data.next || null;
  }
  return filings;
}

function causeKey(f: Filing): string {
  const c = f.cause || f.suitNature || 'unspecified';
  return c.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function scoutMilberg(dry: boolean, started: number) {
  const filings = await fetchWatchedFilings();
  const groups = new Map<string, Filing[]>();
  for (const f of filings) {
    const k = causeKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }

  const clusters = [...groups.entries()].filter(([, fs]) => fs.length >= MIN_FILINGS).sort((a, b) => b[1].length - a[1].length);
  const report: any[] = [];
  let drafted = 0;

  for (const [key, fs] of clusters) {
    if (drafted >= MAX_DRAFTS || Date.now() - started > TIME_BUDGET_MS) break;

    // Only bother if at least one filing in this cluster is new since we last looked.
    const unseen: Filing[] = [];
    for (const f of fs) if (!(await wasSeen('milberg-docket', String(f.docket_id)))) unseen.push(f);
    if (unseen.length === 0) { report.push({ cause: key, filings: fs.length, action: 'no new filings' }); continue; }

    const list = fs
      .map((f, i) => `${i + 1}. [docket ${f.docket_id}] ${f.caseName} — ${f.court}, filed ${f.dateFiled}. Cause: ${f.cause || '—'}. Nature of suit: ${f.suitNature || '—'}. Parties: ${f.parties.slice(0, 4).join('; ')}. First entry: ${f.description}`)
      .join('\n');

    const prompt = `You help a consumer law firm decide whether a cluster of newly filed federal class actions points to a pattern worth opening an investigation on.

All ${fs.length} filings below were brought in the last ${WINDOW_DAYS} days under the same civil-cover-sheet cause of action ("${key}"):

${list}

Step 1 — Decide whether these filings share a COHERENT theory a consumer would recognize: the same defendant, the same product or service type, or the same specific statutory claim (e.g. FDCPA collection letters, ERISA forfeiture, BIPA biometrics, data breach, "natural" labeling). Three unrelated personal-injury suits that merely share a cover-sheet code are NOT coherent.

Step 2 — If there is one or more coherent theme with at least ${MIN_FILINGS} filings each, write an investigation for each theme. Otherwise skip.

${DRAFT_STYLE_RULES}
In "why_matters", mention that at least N putative class actions were filed in federal courts in the recent period and what they allege, without naming law firms.

Respond with ONLY JSON:
{
  "skip": boolean,
  "reason": "one sentence",
  "themes": [
    {
      "docket_ids": [numbers from the list that belong to this theme],
      "title": "...", "defendant": "...", "category": "...",
      "allegation": "...", "affected": "...", "why_matters": "..."
    }
  ]
}`;

    let result: any;
    try { result = await draftWithClaude(prompt, 1800); }
    catch (err: any) { report.push({ cause: key, filings: fs.length, action: 'model error', error: err?.message }); continue; }

    const themes: any[] = result?.skip ? [] : (result?.themes ?? []);
    const kept = themes.filter((t) => Array.isArray(t.docket_ids) && t.docket_ids.length >= MIN_FILINGS);
    if (kept.length === 0) {
      report.push({ cause: key, filings: fs.length, action: 'skipped', reason: result?.reason });
      if (!dry) for (const f of fs) await markSeen('milberg-docket', String(f.docket_id), `no theme: ${key}`);
      continue;
    }

    for (const t of kept) {
      if (drafted >= MAX_DRAFTS) break;
      const members = fs.filter((f) => t.docket_ids.includes(f.docket_id));
      const ref = `${key}|${slug(t.defendant)}`;
      if (await draftExists('milberg', ref, 45)) { report.push({ cause: key, theme: t.title, action: 'already drafted' }); continue; }

      const fields: DraftFields = { title: t.title, defendant: t.defendant, category: t.category, allegation: t.allegation, affected: t.affected, why_matters: t.why_matters };
      const evidence: Evidence[] = members.map((f) => ({ kind: 'filing', label: `${f.caseName} (${f.court}, No. ${f.docket_id})`, url: f.url, date: f.dateFiled, detail: f.description }));

      if (dry) { report.push({ cause: key, theme: t.title, filings: members.length, action: 'would draft', fields }); drafted++; continue; }

      const id = await createDraft(fields, { source: 'milberg', sourceRef: ref, evidence });
      const emailed = await notifyDraft(id, fields, { source: 'milberg', evidence });
      for (const f of members) await markSeen('milberg-docket', String(f.docket_id), `draft #${id}`);
      report.push({ cause: key, theme: t.title, filings: members.length, action: 'drafted', id, emailed });
      drafted++;
    }
  }

  return { filingsInWindow: filings.length, clusters: clusters.map(([k, fs]) => ({ cause: k, count: fs.length })), drafted, report };
}

// ---------------------------------------------------------------------------
// Part B — ClassAction.org watch (via sitemap)
// ---------------------------------------------------------------------------

const CA_SOURCE = 'classaction.org';
const CA_SITEMAP = 'https://www.classaction.org/sitemap.xml';
const CA_UA = 'Mozilla/5.0 (compatible; ClassActionDailyBot/1.0; +https://www.classactiondaily.com/about)';
const CA_SKIP_SLUGS = new Set([
  'about', 'about-us', 'contact', 'contact-us', 'privacy-policy', 'terms', 'terms-of-use', 'settlements', 'news', 'blog',
  'list-of-lawsuits', 'find-a-class-action-lawyer', 'knowledge-center', 'faq', 'sitemap', 'newsletter', 'disclaimer',
  'open-lawsuit-settlements', 'class-action-database', 'legal-help', 'resources', 'careers', 'advertise',
]);

function parseSitemapTopLevel(xml: string): { url: string; slug: string; lastmod: string }[] {
  const out: { url: string; slug: string; lastmod: string }[] = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1].trim();
    const mm = loc.match(/^https?:\/\/(?:www\.)?classaction\.org\/([a-z0-9-]+)\/?$/i);
    if (!mm) continue;
    const slug = mm[1].toLowerCase();
    if (CA_SKIP_SLUGS.has(slug)) continue;
    out.push({ url: loc, slug, lastmod: (m[2] || '').trim() });
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function scoutClassActionOrg(dry: boolean, started: number) {
  const res = await fetch(CA_SITEMAP, { headers: { 'User-Agent': CA_UA } });
  if (!res.ok) throw new Error(`sitemap ${res.status}`);
  const entries = parseSitemapTopLevel(await res.text());

  // First run: remember everything that exists today and draft nothing.
  if ((await seenCount(CA_SOURCE)) === 0) {
    if (!dry) for (const e of entries) await markSeen(CA_SOURCE, e.slug, 'seeded');
    return { seeded: entries.length, note: 'First run: recorded existing pages. New pages will be evaluated from tomorrow.' };
  }

  const fresh: typeof entries = [];
  for (const e of entries) if (!(await wasSeen(CA_SOURCE, e.slug))) fresh.push(e);

  const report: any[] = [];
  let drafted = 0;
  for (const e of fresh.slice(0, 8)) {
    if (drafted >= MAX_DRAFTS || Date.now() - started > TIME_BUDGET_MS) break;

    let text = '';
    let title = e.slug;
    try {
      const pr = await fetch(e.url, { headers: { 'User-Agent': CA_UA } });
      if (!pr.ok) throw new Error(`page ${pr.status}`);
      const html = await pr.text();
      title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || e.slug).trim();
      text = htmlToText(html).slice(0, 9000);
    } catch (err: any) {
      report.push({ slug: e.slug, action: 'fetch failed', error: err?.message });
      if (!dry) await markSeen(CA_SOURCE, e.slug, 'fetch failed');
      continue;
    }

    const prompt = `Below is the text of a page from a consumer legal-news website. Classify it, and if it describes a pre-litigation INVESTIGATION (attorneys looking into a potential class action; no lawsuit necessarily filed yet), write an original investigation for a different website on the same topic.

Page title: ${title}
Page URL: ${e.url}

PAGE TEXT (for understanding the topic only — do not copy any sentence from it):
"""
${text}
"""

${DRAFT_STYLE_RULES}
Ground "why_matters" only in facts stated on the page (recalls, studies, regulatory actions, filed cases) or well-known public facts; do not invent statistics.

Respond with ONLY JSON:
{
  "type": "investigation" | "lawsuit" | "settlement" | "other",
  "skip": boolean,
  "reason": "one sentence",
  "title": "...", "defendant": "...", "category": "...",
  "allegation": "...", "affected": "...", "why_matters": "..."
}`;

    let result: any;
    try { result = await draftWithClaude(prompt, 1400); }
    catch (err: any) { report.push({ slug: e.slug, action: 'model error', error: err?.message }); continue; }

    if (result?.type !== 'investigation' || result?.skip) {
      report.push({ slug: e.slug, type: result?.type, action: 'skipped', reason: result?.reason });
      if (!dry) await markSeen(CA_SOURCE, e.slug, `skipped: ${result?.type}`);
      continue;
    }

    const fields: DraftFields = { title: result.title, defendant: result.defendant, category: result.category, allegation: result.allegation, affected: result.affected, why_matters: result.why_matters };
    const evidence: Evidence[] = [{ kind: 'page', label: title, url: e.url, date: e.lastmod || undefined }];

    if (dry) { report.push({ slug: e.slug, action: 'would draft', fields }); drafted++; continue; }

    const id = await createDraft(fields, { source: CA_SOURCE, sourceRef: e.slug, sourceUrl: e.url, evidence });
    const emailed = await notifyDraft(id, fields, { source: CA_SOURCE, sourceUrl: e.url, evidence });
    await markSeen(CA_SOURCE, e.slug, `draft #${id}`);
    report.push({ slug: e.slug, action: 'drafted', id, emailed });
    drafted++;
  }

  return { pagesInSitemap: entries.length, newPages: fresh.length, evaluated: Math.min(fresh.length, 8), drafted, report };
}

function slug(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
