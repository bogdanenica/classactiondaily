import { neon } from '@neondatabase/serverless';
import Link from 'next/link';

export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function CategoriesIndex() {
  const rows = await sql`
    SELECT category, COUNT(*)::int AS case_count
    FROM cases
    WHERE category IS NOT NULL
    GROUP BY category
    ORDER BY case_count DESC, category ASC
  `;

  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/">Home</Link> › Categories</div>
      <h1 style={{ marginBottom: 8 }}>Browse by category</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginBottom: 24 }}>
        Consumer class actions tracked, grouped by product or service category.
      </p>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)' }}>No categories yet — cases will appear here once they&apos;re ingested.</p>
      ) : (
        <div className="defendant-grid">
          {rows.map((r: any) => (
            <div key={r.category} className="defendant-card">
              <h4>{r.category}</h4>
              <div className="count">{r.case_count} {r.case_count === 1 ? 'case' : 'cases'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}