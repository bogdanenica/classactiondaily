import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import CaseFilters from './components/CaseFilters';
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, CATEGORIES, formatDate } from './lib/site';

// This page reads searchParams (filters), so it renders on demand rather than
// from a 1-hour cache. Neon queries are cheap; this is fine at current traffic.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}: ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
};

const sql = neon(process.env.DATABASE_URL!);

type SearchParams = Promise<{ category?: string | string[]; days?: string }>;

function parseFilters(sp: { category?: string | string[]; days?: string }) {
  const raw = sp.category;
  const requested = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const valid = new Set<string>(CATEGORIES);
  const selected = requested.filter((c) => valid.has(c));
  const days: '7' | '30' | 'all' = sp.days === '7' ? '7' : sp.days === '30' ? '30' : 'all';
  return { selected, days };
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { selected, days } = parseFilters(await searchParams);

  // Null-tolerant SQL: when a filter is "all", its parameter is NULL and the
  // condition short-circuits to true. Lets us keep a single tagged query.
  const since =
    days === 'all' ? null : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const cats = selected.length > 0 ? selected : null;

  const cases = await sql`
    SELECT c.id, c.case_name, c.defendant, c.court_name, c.docket_number,
           c.date_filed, c.category, c.allegation_type, c.summary, c.image_url,
           COALESCE((to_jsonb(c)->>'curated')::boolean, false) AS curated
    FROM cases c
    -- A case added by hand sorts by the day it was added, not its filing date.
    WHERE (${since}::date IS NULL OR (CASE WHEN c.manual IS TRUE THEN c.created_at::date ELSE c.date_filed END) >= ${since}::date)
      AND (${cats}::text[] IS NULL OR c.category = ANY(${cats}::text[]))
    ORDER BY (CASE WHEN c.manual IS TRUE THEN c.created_at::date ELSE c.date_filed END) DESC, c.id DESC
    LIMIT 50
  `;

  const totalRows = await sql`SELECT COUNT(*)::int AS n FROM cases`;
  const total = totalRows[0]?.n ?? 0;

  const today = new Date().toISOString().split('T')[0];
  const newTodayRows = await sql`SELECT COUNT(*)::int AS n FROM cases WHERE date_filed = ${today}::date`;
  const newToday = newTodayRows[0]?.n ?? 0;

  const lastRow = await sql`SELECT MAX(created_at) AS t FROM cases`;
  const lastUpdate = lastRow[0]?.t ? new Date(lastRow[0].t) : new Date();

  const isFiltered = selected.length > 0 || days !== 'all';

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>New consumer class actions, tracked daily.</h1>
          <p>We track new consumer class action complaints and publish plain-English summaries. Sourced from CourtListener, state court filings, and other public sources. Cases marked <span style={{ color: 'var(--accent)' }} aria-hidden="true">★</span> have a summary reviewed by an attorney before publication.</p>
          <div className="hero-meta">
            <span><strong>{newToday}</strong> new today</span>
            <span><strong>{total}</strong> total cases tracked</span>
            <span>Last update: <strong>{lastUpdate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} ET</strong></span>
          </div>
        </div>
      </section>

      <div className="page-grid">
        <CaseFilters categories={CATEGORIES} selected={selected} days={days} />

        <main>
          <div className="cases-header">
            <h2>{isFiltered ? 'Matching filings' : 'Recent filings'}</h2>
            {isFiltered && (
              <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                {cases.length} {cases.length === 1 ? 'case' : 'cases'}
                {cases.length === 50 ? ' (showing first 50)' : ''} · <Link href="/">Clear filters</Link>
              </span>
            )}
          </div>

          {cases.length === 0 && (
            <p style={{ color: 'var(--ink-muted)' }}>
              {isFiltered ? 'No cases match these filters. Try widening the date range.' : 'No cases ingested yet.'}
            </p>
          )}

          {cases.map((c: any) => {
            const isNew = new Date(c.date_filed).toISOString().split('T')[0] === today;
            return (
              <Link key={c.id} href={`/cases/${c.id}`} className="case-card">
                {c.image_url && (
                  <img
                    src={c.image_url}
                    alt={`Illustration for ${c.case_name}`}
                    loading="lazy"
                    style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 4, marginBottom: 14, display: 'block' }}
                  />
                )}
                <div className="case-meta">
                  {isNew && <span className="tag new">New today</span>}
                  {c.category && <span className="tag">{c.category}</span>}
                  {c.allegation_type && <span className="tag">{c.allegation_type}</span>}
                </div>
                <h3>{c.curated && <span style={{ color: 'var(--accent)' }} title="Summary reviewed by an attorney before publication">★ </span>}{c.case_name}</h3>
                <div className="case-defendant"><strong>Defendant:</strong> {c.defendant}</div>
                <p className="case-summary">{c.summary}</p>
                <div className="case-footer">
                  <span className="court-info">
                    {c.court_name} · Case {c.docket_number} · Filed {formatDate(c.date_filed)}
                  </span>
                  <span className="qualify-btn">Do you qualify? →</span>
                </div>
              </Link>
            );
          })}
        </main>
      </div>
    </>
  );
}
