import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { OWNER, formatDate } from '../lib/site';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Open investigations — potential class actions under review',
  description: `Pre-litigation consumer investigations curated by attorneys at ${OWNER.firm}. No lawsuit has been filed yet; if you were affected, your information helps determine whether a case can be brought.`,
  alternates: { canonical: '/investigations' },
};

const sql = neon(process.env.DATABASE_URL!);

export default async function InvestigationsIndex() {
  const investigations = await sql`
    SELECT id, title, defendant, category, allegation, opened_date, updated_date
    FROM investigations
    WHERE status = 'open'
    ORDER BY opened_date DESC
  `;

  return (
    <>
      <section className="hero inv-hero">
        <div className="hero-inner">
          <div className="inv-status">Open Investigations</div>
          <h1>Are you affected by one of these?</h1>
          <p>Attorneys are investigating potential class actions against the companies and products listed below. These are pre-litigation — no lawsuit has been filed yet. If you&apos;ve been affected, your information helps determine whether a case can be brought.</p>
          <div className="hero-meta">
            <span><strong>{investigations.length}</strong> open investigations</span>
            <span>Curated by attorneys at {OWNER.firm}</span>
          </div>
        </div>
      </section>

      <div className="page-grid">
        <aside className="filters">
          <div className="filter-group">
            <h3>Investigation Type</h3>
            <label><input type="checkbox" defaultChecked /> Health & safety</label>
            <label><input type="checkbox" defaultChecked /> Mislabeling</label>
            <label><input type="checkbox" defaultChecked /> Hidden fees</label>
            <label><input type="checkbox" defaultChecked /> Privacy & data</label>
            <label><input type="checkbox" defaultChecked /> Product defect</label>
          </div>
        </aside>
        <main>
          <div className="cases-header"><h2>Open investigations</h2></div>
          {investigations.length === 0 && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>
              <p style={{ marginBottom: 8 }}>No open investigations right now.</p>
              <p style={{ fontSize: 13 }}>Check back soon, or browse the <Link href="/">latest filed cases</Link>.</p>
            </div>
          )}
          {investigations.map((v: any) => (
            <Link key={v.id} href={`/investigations/${v.id}`} className="case-card investigation-card">
              <div className="case-meta">
                <span className="tag investigation">Open Investigation</span>
                <span className="tag">{v.category}</span>
              </div>
              <h3>{v.title}</h3>
              <div className="case-defendant"><strong>Under investigation:</strong> {v.defendant}</div>
              <p className="case-summary">{v.allegation.slice(0, 280)}{v.allegation.length > 280 ? '…' : ''}</p>
              <div className="case-footer">
                <span className="court-info">Opened {formatDate(v.opened_date)} · Pre-litigation</span>
                <span className="qualify-btn">Tell us your story →</span>
              </div>
            </Link>
          ))}
        </main>
      </div>
    </>
  );
}
