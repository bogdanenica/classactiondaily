import type { Metadata } from 'next';
import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { categorySlug } from '../lib/site';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Browse class actions by category',
  description: 'Consumer class actions filed in U.S. courts, grouped by product or service category: food & beverage, financial products, retail, subscriptions, personal care, automotive, and more.',
  alternates: { canonical: '/categories' },
};

const sql = neon(process.env.DATABASE_URL!);

export default async function CategoriesIndex() {
  const rows = await sql`
    SELECT category, COUNT(*)::int AS case_count, MAX(date_filed) AS latest
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
        Consumer class actions tracked, grouped by product or service category. Click a category to see every case we have on file.
      </p>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)' }}>No categories yet. Cases will appear here once they&apos;re ingested.</p>
      ) : (
        <div className="defendant-grid">
          {rows.map((r: any) => (
            <Link key={r.category} href={`/categories/${categorySlug(r.category)}`} className="defendant-card">
              <h4>{r.category}</h4>
              <div className="count">{r.case_count} {r.case_count === 1 ? 'case' : 'cases'}</div>
              {r.latest && (
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                  Latest filed {new Date(r.latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
