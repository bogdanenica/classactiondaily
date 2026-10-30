import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { generateImagePrompt, generateAndStoreImage, IMAGE_VERSION } from '@/app/lib/imageGen';

// One-time backfill: regenerates pictures for existing cases using the new,
// case-aware prompt and model. Safe to call repeatedly — it only touches cases
// whose image isn't already the current IMAGE_VERSION, newest first, and stops
// after ~4 minutes so it never hits Vercel's function limit.
//
// Call it by opening this in a browser (replace KEY with your CRON_SECRET):
//   https://www.classactiondaily.com/api/admin/regen-images?key=KEY&days=30
// Reload until the response says "remaining": 0.
//
// Options:
//   days=30   only cases filed in the last N days (default 30). days=all for everything.
//   limit=20  max images per call (default 20, max 25).
//   dry=1     list what would be regenerated without doing it.

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const TIME_BUDGET_MS = 240_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const key = searchParams.get('key');
  const secret = process.env.CRON_SECRET;
  if (!secret || (authHeader !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const daysRaw = searchParams.get('days') ?? '30';
  const allTime = daysRaw === 'all';
  const days = allTime ? null : Math.max(1, parseInt(daysRaw, 10) || 30);
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
  const limit = Math.min(25, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20));
  const dry = searchParams.get('dry') === '1';
  const marker = `%-${IMAGE_VERSION}.jpg`;

  const candidates = await sql`
    SELECT id, courtlistener_id, case_name, defendant, category, allegation_type, summary, image_url, date_filed
    FROM cases
    WHERE (${since}::date IS NULL OR date_filed >= ${since}::date)
      AND (image_url IS NULL OR image_url NOT LIKE ${marker})
    ORDER BY date_filed DESC, id DESC
    LIMIT ${limit}
  `;

  const remainingRows = await sql`
    SELECT COUNT(*)::int AS n FROM cases
    WHERE (${since}::date IS NULL OR date_filed >= ${since}::date)
      AND (image_url IS NULL OR image_url NOT LIKE ${marker})
  `;
  const remainingBefore = remainingRows[0]?.n ?? 0;

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      scope: allTime ? 'all time' : `last ${days} days`,
      remaining: remainingBefore,
      next: candidates.map((c: any) => ({ id: c.id, case: c.case_name, filed: c.date_filed })),
    });
  }

  const started = Date.now();
  const done: { id: number; case: string; url: string }[] = [];
  const errors: { id: number; case: string; error: string }[] = [];

  for (const c of candidates) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const prompt = await generateImagePrompt({
        caseName: c.case_name,
        defendant: c.defendant,
        category: c.category ?? 'Other',
        allegation: c.allegation_type,
        summary: c.summary,
      });
      const url = await generateAndStoreImage(prompt, `cases/${c.courtlistener_id}-${IMAGE_VERSION}`);
      await sql`UPDATE cases SET image_url = ${url} WHERE id = ${c.id}`;
      done.push({ id: c.id, case: c.case_name, url });
    } catch (err: any) {
      errors.push({ id: c.id, case: c.case_name, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    scope: allTime ? 'all time' : `last ${days} days`,
    regenerated: done.length,
    failed: errors.length,
    remaining: Math.max(0, remainingBefore - done.length),
    seconds: Math.round((Date.now() - started) / 1000),
    done,
    errors,
  });
}
