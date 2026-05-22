import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { generateImagePrompt, generateAndStoreImage } from '@/app/lib/imageGen';
const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const maxDuration = 300;
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const imageErrors: string[] = [];

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const url = new URL('https://www.courtlistener.com/api/rest/v4/search/');
  url.searchParams.set('type', 'r');
  url.searchParams.set('q', '"class action"');
  url.searchParams.set('filed_after', yesterday);
  url.searchParams.set('order_by', 'dateFiled desc');

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` },
    });
    if (res.ok) break;
    if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
  }
  if (!res || !res.ok) {
    return NextResponse.json({ error: `CourtListener: ${res?.status ?? 'no response'}` }, { status: 500 });
  }
  const data = await res.json();

  let inserted = 0;
  for (const r of data.results) {
    const existing = await sql`
      SELECT id FROM cases WHERE courtlistener_id = ${r.docket_id}
    `;
    if (existing.length > 0) continue;

    const caseName = r.caseName || '';
    const summary = await summarizeCase(caseName, r.cause || '', r.suitNature || '');

    if (summary.category === 'Other') {
      continue;
    }

    let imageUrl: string | null = null;
    try {
      const imgPrompt = await generateImagePrompt({
        category: summary.category,
        allegation: summary.allegation_type,
      });
      imageUrl = await generateAndStoreImage(imgPrompt, `cases/${r.docket_id}`);
    } catch (err: any) {
      console.error('Image gen failed:', err);
      imageErrors.push(`${r.docket_id}: ${err?.message || String(err)}`);
    }

    await sql`
      INSERT INTO cases (
        courtlistener_id, docket_number, case_name, court_id, court_name,
        date_filed, defendant, category, allegation_type, summary, raw_complaint_url, image_url
      ) VALUES (
        ${r.docket_id}, ${r.docketNumber}, ${caseName}, ${r.court_id},
        ${r.court}, ${r.dateFiled}, ${summary.defendant},
        ${summary.category}, ${summary.allegation_type}, ${summary.summary},
        ${r.docket_absolute_url ? `https://www.courtlistener.com${r.docket_absolute_url}` : null},
        ${imageUrl}
      )
    `;
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, scanned: data.results.length, imageErrors });
}

async function summarizeCase(caseName: string, cause: string, suitNature: string) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are summarizing a newly filed consumer class action lawsuit.

Case name: ${caseName}
Cause of action: ${cause || 'not specified'}
Nature of suit: ${suitNature || 'not specified'}

Respond ONLY with valid JSON in this exact shape:
{
  "defendant": "the company being sued, as a clean name without LLC/Inc unless ambiguous",
  "category": "one of: Food & beverage | Consumer electronics | Subscription services | Personal care | Automotive | Retail | Apparel | Financial products | Home appliances | Other",
  "allegation_type": "one of: False advertising | Mislabeling | Auto-renewal | Product defect | Pricing | Privacy | Other",
  "summary": "a single paragraph, 100-150 words, plain English, explaining what plaintiffs allege and who is in the proposed class. No legal jargon. No quotes from the complaint."
}`
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}