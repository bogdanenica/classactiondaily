import { neon } from '@neondatabase/serverless';
import Link from 'next/link';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function DefendantsIndex() {
  const rows = await sql`
    SELECT defendant, COUNT(*)::int AS case_count
    FROM cases
    WHERE defendant IS NOT NULL
    GROUP BY defendant
    ORDER BY case_count DESC, defendant ASC
    LIMIT 60
  `;

  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/">Home</Link> › Defendants</div>
      <h1 style={{ marginBottom: 8 }}>Defendants</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginBottom: 24 }}>
        Companies named in active consumer class actions, sorted by number of cases tracked.
      </p>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)' }}>No defendants yet.</p>
      ) : (
        <div className="defendant-grid">
          {rows.map((r: any) => (
            <div key={r.defendant} className="defendant-card">
              <h4>{r.defendant}</h4>
              <div className="count">{r.case_count} {r.case_count === 1 ? 'case' : 'cases'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}