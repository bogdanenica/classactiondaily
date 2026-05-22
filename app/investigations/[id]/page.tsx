import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IntakeForm from '../../components/IntakeForm';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function InvestigationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invId = parseInt(id, 10);
  if (isNaN(invId)) notFound();

  const rows = await sql`SELECT * FROM investigations WHERE id = ${invId}`;
  const v = rows[0];
  if (!v) notFound();

  const subs = await sql`SELECT COUNT(*)::int AS n FROM leads WHERE investigation_id = ${invId}`;

  return (
    <div className="single-col">
      <div className="breadcrumb">
        <Link href="/investigations">Investigations</Link> › {v.title}
      </div>
      <div className="detail-header" style={{ borderLeft: '3px solid var(--accent)' }}>
        <div className="inv-status">Open Investigation · Pre-litigation</div>
        <h1>{v.title}</h1>
        <div className="case-defendant"><strong>Under investigation:</strong> {v.defendant}</div>
        <div className="case-meta">
          <span className="tag">{v.category}</span>
        </div>
        <div className="docket-row">
          <div className="docket-cell">Status<strong>Open · accepting submissions</strong></div>
          <div className="docket-cell">Opened<strong>{new Date(v.opened_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
          <div className="docket-cell">Last updated<strong>{new Date(v.updated_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
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
          <p>If enough affected individuals come forward and the facts support viable legal claims, a participating plaintiffs&apos; firm may file a putative class action. Investigations may also be closed without a filing if attorneys conclude the case is not viable. Submitting your information does not commit you to anything.</p>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 20 }}>
            This investigation is editorially curated. Last reviewed {new Date(v.updated_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>
        <div className="detail-side">
          <IntakeForm investigationId={v.id} productHint="When did this happen? What harm did you experience?" />
        </div>
      </div>
    </div>
  );
}