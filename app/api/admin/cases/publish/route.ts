import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminAuthenticated } from '@/app/admin/auth';
import { generateImagePrompt, generateAndStoreImage, IMAGE_VERSION } from '@/app/lib/imageGen';
import { tidy } from '@/app/lib/caseQuality';
import { CATEGORIES } from '@/app/lib/site';

// Step 2 of adding a case by hand: publish the reviewed draft.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const sql = neon(process.env.DATABASE_URL!);
const ALLEGATIONS = ['False advertising', 'Mislabeling', 'Auto-renewal', 'Product defect', 'Pricing', 'Privacy', 'Other'];

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let b: any;
  try { b = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const str = (v: unknown, max = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const caseName = str(b.caseName, 300);
  const court = str(b.court, 200);
  const docketNumber = str(b.docketNumber, 100);
  const dateFiled = str(b.dateFiled, 10);
  const defendant = str(b.defendant, 300);
  const summary = tidy(String(b.summary ?? '')).slice(0, 4000);
  const category = (CATEGORIES as readonly string[]).includes(b.category) ? b.category : 'Other';
  const allegation = ALLEGATIONS.includes(b.allegationType) ? b.allegationType : 'Other';
  const link = str(b.link, 1000);
  const curated = b.curated === true;
  const firmRepresents = b.firmRepresents === true;

  if (!caseName || !court || !defendant) return NextResponse.json({ error: 'Case name, court, and defendant are required.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFiled)) return NextResponse.json({ error: 'Enter the filing date.' }, { status: 400 });
  if (summary.split(/\s+/).length < 30) return NextResponse.json({ error: 'The summary is too short.' }, { status: 400 });
  if (link && !/^https?:\/\//i.test(link)) return NextResponse.json({ error: 'The link must start with http:// or https://' }, { status: 400 });

  // Same case already on the site?
  if (docketNumber) {
    const dup = await sql`SELECT id FROM cases WHERE docket_number = ${docketNumber} AND court_name = ${court} LIMIT 1`;
    if (dup.length > 0) return NextResponse.json({ error: `This case is already on the site (case ${dup[0].id}).`, id: dup[0].id }, { status: 409 });
  }

  let imageUrl: string | null = null;
  let imageError: string | null = null;
  try {
    const prompt = await generateImagePrompt({ caseName, defendant, category, allegation, summary });
    imageUrl = await generateAndStoreImage(prompt, `cases/manual-${Date.now()}-${IMAGE_VERSION}`);
  } catch (err: any) {
    imageError = String(err?.message || err).slice(0, 200);
  }

  const rows = await sql`
    INSERT INTO cases (
      docket_number, case_name, court_name, date_filed, defendant, category, allegation_type,
      summary, raw_complaint_url, image_url, summary_source, manual, source_note,
      curated, curated_at, firm_represents, meta_checked_at, enrich_checked_at
    ) VALUES (
      ${docketNumber || null}, ${caseName}, ${court}, ${dateFiled}, ${defendant}, ${category}, ${allegation},
      ${summary}, ${link || null}, ${imageUrl}, 'complaint', true, ${court},
      ${curated}, ${curated ? new Date().toISOString() : null}, ${firmRepresents}, now(), now()
    )
    RETURNING id
  `;
  const id = rows[0].id;
  revalidatePath('/');
  revalidatePath('/categories');
  revalidatePath('/defendants');
  revalidatePath('/sitemap.xml');
  return NextResponse.json({ ok: true, id, url: `/cases/${id}`, imageError });
}
