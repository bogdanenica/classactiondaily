import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IntakeForm from '../../components/IntakeForm';
import JsonLd from '../../components/JsonLd';
import { SITE_URL, SITE_NAME, OWNER, categorySlug, snippet, formatDate } from '../../lib/site';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

type Params = Promise<{ id: string }>;

async function getCase(idRaw: string) {
  const caseId = parseInt(idRaw, 10);
  if (isNaN(caseId)) return null;
  const rows = await sql`
    SELECT id, case_name, defendant, court_name, court_id, docket_number,
           date_filed, category, allegation_type, summary, raw_complaint_url, image_url, created_at
    FROM cases WHERE id = ${caseId}
  `;
  return rows[0] ?? null;
}

// Per-page <title>, <meta description>, canonical, and Open Graph — this is
// what lets Google rank each case for its own case name / defendant.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const c = await getCase(id);
  if (!c) return { title: 'Case not found' };

  const title = `${c.case_name} — ${c.defendant} class action`;
  const description = snippet(c.summary, 155);
  const url = `${SITE_URL}/cases/${c.id}`;

  return {
    title,
    description,
    alternates: { canonical: `/cases/${c.id}` },
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: SITE_NAME,
      publishedTime: new Date(c.date_filed).toISOString(),
      images: c.image_url ? [{ url: c.image_url, alt: `Illustration for ${c.case_name}` }] : undefined,
    },
    twitter: {
      card: c.image_url ? 'summary_large_image' : 'summary',
      title,
      description,
      images: c.image_url ? [c.image_url] : undefined,
    },
  };
}

export default async function CaseDetail({ params }: { params: Params }) {
  const { id } = await params;
  const c = await getCase(id);
  if (!c) notFound();

  const today = new Date().toISOString().split('T')[0];
  const isNew = new Date(c.date_filed).toISOString().split('T')[0] === today;
  const url = `${SITE_URL}/cases/${c.id}`;

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    mainEntityOfPage: url,
    headline: c.case_name,
    description: snippet(c.summary, 200),
    image: c.image_url ? [c.image_url] : undefined,
    datePublished: new Date(c.created_at ?? c.date_filed).toISOString(),
    dateModified: new Date(c.created_at ?? c.date_filed).toISOString(),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@id': `${SITE_URL}/#organization` },
    about: {
      '@type': 'Thing',
      name: `${c.case_name}, ${c.court_name}, No. ${c.docket_number}`,
    },
    articleSection: c.category ?? undefined,
    isBasedOn: c.raw_complaint_url ?? undefined,
    isAccessibleForFree: true,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Latest cases', item: `${SITE_URL}/` },
      ...(c.category
        ? [{ '@type': 'ListItem', position: 2, name: c.category, item: `${SITE_URL}/categories/${categorySlug(c.category)}` }]
        : []),
      { '@type': 'ListItem', position: c.category ? 3 : 2, name: c.case_name, item: url },
    ],
  };

  return (
    <div className="single-col">
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="breadcrumb">
        <Link href="/">Latest cases</Link>
        {c.category && (
          <> › <Link href={`/categories/${categorySlug(c.category)}`}>{c.category}</Link></>
        )}
        {' › '}{c.case_name}
      </div>

      <article>
        <div className="detail-header">
          <h1>{c.case_name}</h1>
          <div className="case-defendant"><strong>Defendant:</strong> {c.defendant}</div>
          <div className="case-meta">
            {isNew && <span className="tag new">New today</span>}
            {c.category && (
              <Link href={`/categories/${categorySlug(c.category)}`} className="tag">{c.category}</Link>
            )}
            {c.allegation_type && <span className="tag">{c.allegation_type}</span>}
          </div>
          <div className="docket-row">
            <div className="docket-cell">Court<strong>{c.court_name}</strong></div>
            <div className="docket-cell">Case Number<strong>{c.docket_number}</strong></div>
            <div className="docket-cell">Filed<strong><time dateTime={new Date(c.date_filed).toISOString().split('T')[0]}>{formatDate(c.date_filed)}</time></strong></div>
            <div className="docket-cell">Status<strong>Pending</strong></div>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-main">
            {c.image_url && (
              <img
                src={c.image_url}
                alt={`Illustration for ${c.case_name}`}
                style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 4, marginBottom: 20, display: 'block' }}
              />
            )}
            <h2>What this case is about</h2>
            <p>{c.summary}</p>

            <h2>What happens next</h2>
            <p>The case is in its earliest stage. The defendant has not yet responded. Class certification — the court&apos;s decision on whether the case can proceed as a class action — typically takes 12 to 24 months after filing. See our <Link href="/faq">FAQ</Link> for how class actions work and what it means to be a class member.</p>

            <p style={{ fontSize: 13, color: 'var(--ink-muted)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 20 }}>
              {c.raw_complaint_url ? (
                <>Source: <a href={c.raw_complaint_url} target="_blank" rel="noopener noreferrer">CourtListener docket entry</a>. </>
              ) : (
                <>Source: CourtListener / PACER public records. </>
              )}
              This summary was generated automatically from the public docket and has not been reviewed by an attorney. It may contain errors and may not reflect subsequent filings. Published by {OWNER.firm}; responsible attorney {OWNER.name}.
            </p>
          </div>

          <div className="detail-side">
            <IntakeForm caseId={c.id} productHint={`e.g., your experience with ${c.defendant}`} />
          </div>
        </div>
      </article>
    </div>
  );
}
