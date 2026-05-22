import { neon } from '@neondatabase/serverless';
import Link from 'next/link';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function Home() {
  const cases = await sql`
    SELECT id, case_name, defendant, court_name, docket_number,
           date_filed, category, allegation_type, summary
    FROM cases
    ORDER BY date_filed DESC, id DESC
    LIMIT 20
  `;

  const totalRows = await sql`SELECT COUNT(*)::int AS n FROM cases`;
  const total = totalRows[0]?.n ?? 0;

  const today = new Date().toISOString().split('T')[0];
  const newToday = cases.filter((c: any) =>
    new Date(c.date_filed).toISOString().split('T')[0] === today
  ).length;

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>Every consumer class action, filed daily.</h1>
          <p>We track new class action complaints in U.S. federal courts and publish plain-English summaries within 24 hours. Updated automatically from CourtListener public records.</p>
          <div className="hero-meta">
            <span><strong>{newToday}</strong> new today</span>
            <span><strong>{total}</strong> total cases tracked</span>
            <span>Last update: <strong>{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
          </div>
        </div>
      </section>

      <div className="page-grid">
        <aside className="filters">
          <div className="filter-group">
            <h3>Category</h3>
            <label><input type="checkbox" defaultChecked /> Food & beverage</label>
            <label><input type="checkbox" defaultChecked /> Consumer electronics</label>
            <label><input type="checkbox" defaultChecked /> Subscription services</label>
            <label><input type="checkbox" defaultChecked /> Personal care</label>
            <label><input type="checkbox" defaultChecked /> Automotive</label>
            <label><input type="checkbox" defaultChecked /> Retail</label>
          </div>
          <div className="filter-divider"></div>
          <div className="filter-group">
            <h3>Filed</h3>
            <label><input type="radio" name="date" defaultChecked /> Last 7 days</label>
            <label><input type="radio" name="date" /> Last 30 days</label>
            <label><input type="radio" name="date" /> All time</label>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 8 }}>
            Filter UI is decorative for now — wiring coming next.
          </p>
        </aside>

        <main>
          <div className="cases-header">
            <h2>Recent filings</h2>
          </div>

          {cases.length === 0 && (
            <p style={{ color: 'var(--ink-muted)' }}>No cases ingested yet.</p>
          )}

          {cases.map((c: any) => {
            const isNew = new Date(c.date_filed).toISOString().split('T')[0] === today;
            return (
              <Link key={c.id} href={`/cases/${c.id}`} className="case-card">
                <div className="case-meta">
                  {isNew && <span className="tag new">New today</span>}
                  {c.category && <span className="tag">{c.category}</span>}
                  {c.allegation_type && <span className="tag">{c.allegation_type}</span>}
                </div>
                <h3>{c.case_name}</h3>
                <div className="case-defendant"><strong>Defendant:</strong> {c.defendant}</div>
                <p className="case-summary">{c.summary}</p>
                <div className="case-footer">
                  <span className="court-info">
                    {c.court_name} · Case {c.docket_number} · Filed {new Date(c.date_filed).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
  const cases = await sql`
    SELECT id, case_name, defendant, court_name, docket_number,
           date_filed, category, allegation_type, summary, image_url
    FROM cases
    ORDER BY date_filed DESC, id DESC
    LIMIT 20
  `;
}
