import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { generateImagePrompt, generateAndStoreImage, IMAGE_VERSION } from '@/app/lib/imageGen';
import { screenDocket, hasDocketInfo, summarizeFromDocket, summaryProblems, tidy } from '@/app/lib/caseQuality';
import { alreadyKnown, holdNew } from '@/app/lib/caseHold';

// Daily intake of newly filed class actions from CourtListener.
//
// A case is published on the day it is filed only when the docket itself says
// what kind of case it is (cause of action or nature of suit) and that kind is
// a consumer case. The first summary states docket facts only. Everything else
// is held: the nightly complaint reader (app/api/cron/enrich) publishes a held
// case once it has read the complaint and confirmed it is a consumer class
// action.

const sql = neon(process.env.DATABASE_URL!);
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || (authHeader !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = searchParams.get('dry') === '1';

  const imageErrors: string[] = [];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
    if (attempt < 3) await new Promise((r) => setTimeout(r, 13_000));
  }
  if (!res || !res.ok) {
    return NextResponse.json({ error: `CourtListener: ${res?.status ?? 'no response'}` }, { status: 500 });
  }
  const data = await res.json();

  let inserted = 0;
  let held = 0;
  const log: any[] = [];

  for (const r of data.results ?? []) {
    if (await alreadyKnown(r.docket_id)) continue;

    const caseName: string = r.caseName || '';
    const cause: string = String(r.cause ?? '').trim();
    const nos: string = String(r.suitNature ?? '').trim();
    const docketUrl = r.docket_absolute_url ? `https://www.courtlistener.com${r.docket_absolute_url}` : null;
    const facts = {
      courtlistener_id: r.docket_id, docket_number: r.docketNumber, case_name: caseName,
      court_id: r.court_id, court_name: r.court, date_filed: r.dateFiled,
      raw_complaint_url: docketUrl, cause, nature_of_suit: nos,
    };
    const hold = async (reason: 'no_info' | 'not_consumer', detail: string) => {
      held++;
      log.push({ case: caseName, action: `held: ${reason}`, detail });
      if (!dry) await holdNew(r.docket_id, caseName, reason, detail, facts);
    };

    const screen = screenDocket(cause, nos);
    if (!screen.consumer) { await hold('not_consumer', screen.reason); continue; }
    if (!hasDocketInfo(cause, nos)) { await hold('no_info', 'docket has no cause of action or nature of suit yet'); continue; }

    let s;
    try {
      s = await summarizeFromDocket({ caseName, court: r.court || '', dateFiled: r.dateFiled || '', cause, nos });
    } catch (err: any) {
      await hold('no_info', `summary failed: ${err?.message || String(err)}`);
      continue;
    }
    if (!s.consumer) { await hold('not_consumer', s.reason || 'not a consumer case'); continue; }
    const problem = summaryProblems(s, 'docket');
    if (problem) { await hold('no_info', problem); continue; }
    if (s.category === 'Other') { await hold('no_info', 'docket facts do not show a consumer category'); continue; }

    const summary = tidy(s.summary);
    if (dry) { inserted++; log.push({ case: caseName, action: 'would publish', cause, nos, summary }); continue; }

    let imageUrl: string | null = null;
    try {
      const imgPrompt = await generateImagePrompt({
        caseName, defendant: s.defendant, category: s.category, allegation: s.allegation_type, summary,
      });
      imageUrl = await generateAndStoreImage(imgPrompt, `cases/${r.docket_id}-${IMAGE_VERSION}`);
    } catch (err: any) {
      console.error('Image gen failed:', err);
      imageErrors.push(`${r.docket_id}: ${err?.message || String(err)}`);
    }

    await sql`
      INSERT INTO cases (
        courtlistener_id, docket_number, case_name, court_id, court_name,
        date_filed, defendant, category, allegation_type, summary, raw_complaint_url, image_url,
        summary_source, cause, nature_of_suit, meta_checked_at
      ) VALUES (
        ${r.docket_id}, ${r.docketNumber}, ${caseName}, ${r.court_id},
        ${r.court}, ${r.dateFiled}, ${s.defendant},
        ${s.category}, ${s.allegation_type}, ${summary}, ${docketUrl}, ${imageUrl},
        'docket', ${cause}, ${nos}, now()
      )
    `;
    inserted++;
    log.push({ case: caseName, action: 'published', cause, nos });
  }

  return NextResponse.json({ ok: true, dry, inserted, held, scanned: (data.results ?? []).length, imageErrors, log });
}
