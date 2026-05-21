import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Nature of suit codes that typically indicate consumer class actions
const CONSUMER_NOS_CODES = ['195', '365', '370', '380', '890'];

export async function GET(request: Request) {
  // Vercel Cron sends an Authorization header; reject anyone else
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  // CourtListener "dockets" endpoint, filtered to recent class action filings
  const url = new URL('https://www.courtlistener.com/api/rest/v4/dockets/');
  url.searchParams.set('date_filed__gte', yesterday);
  url.searchParams.set('nature_of_suit__in', CONSUMER_NOS_CODES.join(','));
  url.searchParams.set('court__jurisdiction', 'FD'); // Federal district
  url.searchParams.set('page_size', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `CourtListener: ${res.status}` }, { status: 500 });
  }
  const data = await res.json();

  let inserted = 0;
  for (const docket of data.results) {
    // Skip if we already have this docket
    const existing = await sql`
      SELECT id FROM cases WHERE courtlistener_id = ${docket.id}
    `;
    if (existing.length > 0) continue;

    // Only proceed if the docket appears to be a class action
    const caseName = docket.case_name || '';
    if (!/class action|class[- ]wide|putative class/i.test(caseName + ' ' + (docket.cause || ''))) {
      continue;
    }

    // Ask Claude to summarize + classify
    const summary = await summarizeCase(caseName, docket.cause, docket.nature_of_suit);

    await sql`
      INSERT INTO cases (
        courtlistener_id, docket_number, case_name, court_id, court_name,
        date_filed, defendant, category, allegation_type, summary, raw_complaint_url
      ) VALUES (
        ${docket.id}, ${docket.docket_number}, ${caseName}, ${docket.court_id},
        ${docket.court}, ${docket.date_filed}, ${summary.defendant},
        ${summary.category}, ${summary.allegation_type}, ${summary.summary},
        ${`https://www.courtlistener.com${docket.absolute_url}`}
      )
    `;
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, scanned: data.results.length });
}

async function summarizeCase(caseName: string, cause: string, nos: string) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are summarizing a newly filed consumer class action lawsuit.

Case name: ${caseName}
Cause of action: ${cause || 'not specified'}
Nature of suit code: ${nos}

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
  // Strip ```json fences if Claude added them
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}