import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '../../components/JsonLd';
import { SITE_URL, categoryFromSlug, formatDate, snippet } from '../../lib/site';

// Reads ?page= so it renders on demand (same as the homepage).
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const PAGE_SIZE = 40;

type Params = Promise<{ category: string }>;
type SearchParams = Promise<{ page?: string }>;

// Short, human intro per category. Gives each page unique copy, which search
// engines reward, and gives visitors context before the list.
const INTROS: Record<string, string> = {
  'Food & beverage': 'Lawsuits over food and drink labeling, ingredient claims, "natural" and "healthy" marketing, contamination, and package sizing.',
  'Consumer electronics': 'Lawsuits over defective devices, battery and performance problems, misleading specifications, and warranty practices.',
  'Subscription services': 'Lawsuits over automatic renewals, hard-to-cancel plans, dark-pattern checkout flows, and undisclosed recurring charges.',
  'Personal care': 'Lawsuits over cosmetics, skincare, supplements, and hygiene products — ingredient claims, "clean" marketing, and safety.',
  'Automotive': 'Lawsuits over vehicle defects, misleading feature claims, dealer practices, and warranty disputes.',
  'Retail': 'Lawsuits against retailers over pricing, accessibility, data practices, and sales tactics.',
  'Apparel': 'Lawsuits over clothing and footwear — pricing claims, fabric and origin labeling, and accessibility.',
  'Financial products': 'Lawsuits over lending, debt collection, securities, banking fees, and other financial services.',
  'Home appliances': 'Lawsuits over appliance defects, energy and performance claims, and recalls.',
  'Other': 'Consumer class actions that do not fit the other categories.',
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return { title: 'Category not found' };
  const countRows = await sql`SELECT COUNT(*)::int AS n FROM cases WHERE category = ${category}`;
  const n = countRows[0]?.n ?? 0;
  return {
    title: `${category} class actions — ${n} filed in U.S. federal courts`,
    description: `${INTROS[category] ?? ''} ${n} consumer class actions tracked, updated daily from CourtListener.`.trim(),
    alternates: { canonical: `/categories/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const countRows = await sql`SELECT COUNT(*)::int AS n FROM cases WHERE category = ${category}`;
  const total = countRows[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();

  const cases = await sql`
    SELECT id, case_name, defendant, court_name, docket_number, date_filed, allegation_type, summary, image_url
    FROM cases
    WHERE category = ${category}
    ORDER BY date_filed DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const url = `${SITE_URL}/categories/${slug}`;
  const listSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    name: `${category} class actions`,
    description: INTROS[category],
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: cases.map((c: any, i: number) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        url: `${SITE_URL}/cases/${c.id}`,
        name: c.case_name,
      })),
    },
  };

  const pageHref = (p: number) => (p === 1 ? `/categories/${slug}` : `/categories/${slug}?page=${p}`);

  return (
    <div className="single-col">
      <JsonLd data={listSchema} />
      <div className="breadcrumb">
        <Link href="/">Home</Link> › <Link href="/categories">Categories</Link> › {category}
      </div>
      <h1 style={{ marginBottom: 8 }}>{category} class actions</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginBottom: 8 }}>{INTROS[category]}</p>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 24 }}>
        {total} {total === 1 ? 'case' : 'cases'} on file
        {totalPages > 1 && <> · page {page} of {totalPages}</>}
      </p>

      {cases.length === 0 && <p style={{ color: 'var(--ink-muted)' }}>No cases in this category yet.</p>}

      {cases.map((c: any) => (
        <Link key={c.id} href={`/cases/${c.id}`} className="case-card">
          <div className="case-meta">
            {c.allegation_type && <span className="tag">{c.allegation_type}</span>}
          </div>
          <h3>{c.case_name}</h3>
          <div className="case-defendant"><strong>Defendant:</strong> {c.defendant}</div>
          <p className="case-summary">{snippet(c.summary, 280)}</p>
          <div className="case-footer">
            <span className="court-info">
              {c.court_name} · Case {c.docket_number} · Filed {formatDate(c.date_filed)}
            </span>
            <span className="qualify-btn">Do you qualify? →</span>
          </div>
        </Link>
      ))}

      {totalPages > 1 && (
        <nav aria-label="Pagination" style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24, fontSize: 14 }}>
          {page > 1 ? <Link href={pageHref(page - 1)} rel="prev">← Newer</Link> : <span style={{ color: 'var(--ink-muted)' }}>← Newer</span>}
          <span style={{ color: 'var(--ink-muted)' }}>Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={pageHref(page + 1)} rel="next">Older →</Link> : <span style={{ color: 'var(--ink-muted)' }}>Older →</span>}
        </nav>
      )}
    </div>
  );
}
