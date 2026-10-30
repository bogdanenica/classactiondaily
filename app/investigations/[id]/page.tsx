import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IntakeForm from '../../components/IntakeForm';
import JsonLd from '../../components/JsonLd';
import { SITE_URL, OWNER, snippet, formatDate } from '../../lib/site';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

type Params = Promise<{ id: string }>;

async function getInvestigation(idRaw: string) {
  const invId = parseInt(idRaw, 10);
  if (isNaN(invId)) return null;
  const rows = await sql`SELECT * FROM investigations WHERE id = ${invId}`;
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const v = await getInvestigation(id);
  if (!v) return { title: 'Investigation not found' };
  const title = `${v.title} — open investigation`;
  const description = snippet(v.allegation, 155);
  return {
    title,
    description,
    alternates: { canonical: `/investigations/${v.id}` },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/investigations/${v.id}`,
      title,
      description,
      publishedTime: new Date(v.opened_date).toISOString(),
      modifiedTime: v.updated_date ? new Date(v.updated_date).toISOString() : undefined,
    },
  };
}

export default async function InvestigationDetail({ params }: { params: Params }) {
  const { id } = await params;
  const v = await getInvestigation(id);
  if (!v) notFound();

  const subs = await sql`SELECT COUNT(*)::int AS n FROM leads WHERE investigation_id = ${v.id}`;
  const url = `${SITE_URL}/investigations/${v.id}`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Investigations', item: `${SITE_URL}/investigations` },
      { '@type': 'ListItem', position: 2, name: v.title, item: url },
    ],
  };

  return (
    <div className="single-col">
      <JsonLd data={breadcrumbSchema} />
      <div className="breadcrumb">
        <Link href="/investigations">Investigations</Link> › {v.title}
      </div>
      <article>
        <div className="detail-header" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div className="inv-status">Open Investigation · Pre-litigation</div>
          <h1>{v.title}</h1>
          <div className="case-defendant"><strong>Under investigation:</strong> {v.defendant}</div>
          <div className="case-meta">
            <span className="tag">{v.category}</span>
          </div>
          <div className="docket-row">
            <div className="docket-cell">Status<strong>Open · accepting submissions</strong></div>
            <div className="docket-cell">Opened<strong>{formatDate(v.opened_date)}</strong></div>
            <div className="docket-cell">Last updated<strong>{formatDate(v.updated_date)}</strong></div>
            <div className="docket-cell">Submissions<strong>{subs[0]?.n ?? 0}</strong></div>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-main">
            <h2>The allegation</h2>
            <p>{v.allegation}</p>
            <h2>Who may be affected</h2>
            <p>{v.affected}</p>
            <h2>Why this matters</h2>
            <p>{v.why_matters}</p>
            <h2>What happens next</h2>
            <p>If enough affected individuals come forward and the facts support viable legal claims, {OWNER.firm} or a co-counsel firm may file a putative class action. Investigations may also be closed without a filing if attorneys conclude the case is not viable. Submitting your information does not commit you to anything and does not create an attorney-client relationship.</p>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 20 }}>
              This investigation is written and curated by attorneys at {OWNER.firm}. Last reviewed {formatDate(v.updated_date)}. Attorney advertising.
            </p>
          </div>
          <div className="detail-side">
            <IntakeForm investigationId={v.id} productHint="When did this happen? What harm did you experience?" />
          </div>
        </div>
      </article>
    </div>
  );
}
