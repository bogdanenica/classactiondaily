import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IntakeForm from '../../components/IntakeForm';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = parseInt(id, 10);
  if (isNaN(caseId)) notFound();

  const rows = await sql`
    SELECT id, case_name, defendant, court_name, court_id, docket_number,
           date_filed, category, allegation_type, summary, raw_complaint_url
    FROM cases WHERE id = ${caseId}
  `;
  const c = rows[0];
  if (!c) notFound();

  const today = new Date().toISOString().split('T')[0];
  const isNew = new Date(c.date_filed).toISOString().split('T')[0] === today;

  return (
    <div className="single-col">
      <div className="breadcrumb">
        <Link href="/">Latest cases</Link> › {c.case_name}
      </div>

      <div className="detail-header">
        <h1>{c.case_name}</h1>
        <div className="case-defendant"><strong>Defendant:</strong> {c.defendant}</div>
        <div className="case-meta">
          {isNew && <span className="tag new">New today</span>}
          {c.category && <span className="tag">{c.category}</span>}
          {c.allegation_type && <span className="tag">{c.allegation_type}</span>}
        </div>
        <div className="docket-row">
          <div className="docket-cell">Court<strong>{c.court_name}</strong></div>
          <div className="docket-cell">Case Number<strong>{c.docket_number}</strong></div>
          <div className="docket-cell">Filed<strong>{new Date(c.date_filed).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
          <div className="docket-cell">Status<strong>Pending</strong></div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-main">
          <h2>What this case is about</h2>
          <p>{c.summary}</p>

          <h2>What happens next</h2>
          <p>The case is in its earliest stage. The defendant has not yet responded. Class certification — the court's decision on whether the case can proceed as a class action — typically takes 12 to 24 months after filing.</p>

          {c.raw_complaint_url && (
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 20 }}>
              Source: <a href={c.raw_complaint_url} target="_blank" rel="noopener noreferrer">CourtListener docket entry</a>. This summary was generated automatically and may not reflect subsequent filings.
            </p>
          )}
        </div>

        <div className="detail-side">
          <IntakeForm caseId={c.id} productHint={`e.g., your experience with ${c.defendant}`} />
        </div>
      </div>
    </div>
  );
}