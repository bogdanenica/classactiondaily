import type { MetadataRoute } from 'next';
import { neon } from '@neondatabase/serverless';
import { SITE_URL, CATEGORIES, categorySlug } from './lib/site';

// Served at /sitemap.xml by Next.js. Regenerated at most once an hour.
export const revalidate = 3600;

const sql = neon(process.env.DATABASE_URL!);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/investigations`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/categories`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/defendants`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}/categories/${categorySlug(c)}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const cases = await sql`
    SELECT id, date_filed, created_at
    FROM cases
    ORDER BY id DESC
  `;
  const casePages: MetadataRoute.Sitemap = cases.map((c: any) => ({
    url: `${SITE_URL}/cases/${c.id}`,
    lastModified: new Date(c.created_at ?? c.date_filed),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const investigations = await sql`
    SELECT id, updated_date, opened_date
    FROM investigations
    WHERE status = 'open'
    ORDER BY id DESC
  `;
  const investigationPages: MetadataRoute.Sitemap = investigations.map((v: any) => ({
    url: `${SITE_URL}/investigations/${v.id}`,
    lastModified: new Date(v.updated_date ?? v.opened_date),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...investigationPages, ...casePages];
}
