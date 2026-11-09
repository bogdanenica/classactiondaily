import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { renderNewsletter, type NewsletterItem } from '@/app/lib/newsletter';
import { sendEmail, sendEmailBatch, emailConfigured } from '@/app/lib/email';
import { OWNER } from '@/app/lib/site';

// Monthly newsletter: investigations opened since the last issue, sent to
// everyone who left the newsletter box checked on the intake form.
// Scheduled in vercel.json for the 1st of each month.
//
// Manual run (replace KEY with CRON_SECRET):
//   /api/cron/newsletter?key=KEY&dry=1    show what would be sent, send nothing
//   /api/cron/newsletter?key=KEY&test=1   send one copy to LEADS_TO_EMAIL only
//   /api/cron/newsletter?key=KEY          send now (once per calendar month)
//   /api/cron/newsletter?key=KEY&force=1  send even if this month already went out

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);
const MAX_ITEMS = 12;
const BATCH = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || (auth !== `Bearer ${secret}` && searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = searchParams.get('dry') === '1';
  const test = searchParams.get('test') === '1';
  const force = searchParams.get('force') === '1';

  const now = new Date();
  const period = now.toISOString().slice(0, 7); // YYYY-MM
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' });

  let items: NewsletterItem[];
  let subscribers: any[];
  try {
    const last = await sql`SELECT max(sent_at) AS at FROM newsletter_issues`;
    const since: string = last[0]?.at
      ? new Date(last[0].at).toISOString()
      : new Date(Date.now() - 31 * 86400000).toISOString();
    items = (await sql`
      SELECT id, title, defendant, category, allegation
      FROM investigations
      WHERE status = 'open' AND opened_date >= ${since}::timestamptz::date
        AND id NOT IN (SELECT unnest(investigation_ids) FROM newsletter_issues)
      ORDER BY opened_date DESC, id DESC
      LIMIT ${MAX_ITEMS}
    `) as NewsletterItem[];
    subscribers = await sql`
      SELECT id, email, full_name, token FROM newsletter_subscribers
      WHERE unsubscribed_at IS NULL ORDER BY id
    `;
  } catch (err: any) {
    return NextResponse.json({
      error: 'Newsletter tables not found. Run neon-status-newsletter-setup.sql in Neon first.',
      detail: err?.message || String(err),
    }, { status: 500 });
  }

  const base = { ok: true, period, investigations: items.length, subscribers: subscribers.length };

  if (items.length === 0) {
    return NextResponse.json({ ...base, sent: 0, note: 'No new open investigations since the last issue; nothing sent.' });
  }

  const from = process.env.NEWSLETTER_FROM_EMAIL || process.env.LEADS_FROM_EMAIL;
  const replyTo = process.env.LEADS_TO_EMAIL || OWNER.email;

  if (dry) {
    const preview = renderNewsletter(items, { monthLabel, token: 'PREVIEW-TOKEN-NOT-REAL', name: 'Jane Doe' });
    return NextResponse.json({ ...base, dry: true, subject: preview.subject, text: preview.text, titles: items.map((i) => i.title) });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ ...base, sent: 0, error: 'RESEND_API_KEY or LEADS_FROM_EMAIL not set.' }, { status: 500 });
  }
  if (test) {
    const m = renderNewsletter(items, { monthLabel, token: 'TEST-TOKEN-NOT-REAL', name: OWNER.name });
    const ok = await sendEmail({ to: replyTo, from, replyTo, subject: `[TEST] ${m.subject}`, text: m.text, html: m.html });
    return NextResponse.json({ ...base, test: true, sent: ok ? 1 : 0, to: replyTo });
  }
  if (subscribers.length === 0) {
    return NextResponse.json({ ...base, sent: 0, note: 'No subscribers yet.' });
  }

  // Claim this month before sending, so a retry or double trigger cannot send twice.
  const claim = await sql`
    INSERT INTO newsletter_issues (period, recipients, investigations, investigation_ids)
    VALUES (${period}, 0, ${items.length}, ${items.map((i) => i.id)})
    ON CONFLICT (period) DO NOTHING
    RETURNING period
  `;
  if (claim.length === 0 && !force) {
    return NextResponse.json({ ...base, sent: 0, note: `The ${period} issue was already sent. Add &force=1 to send again.` });
  }

  let sent = 0;
  for (let i = 0; i < subscribers.length; i += BATCH) {
    const chunk = subscribers.slice(i, i + BATCH);
    const msgs = chunk.map((s: any) => {
      const m = renderNewsletter(items, { monthLabel, token: s.token, name: s.full_name });
      return { to: s.email, from, replyTo, subject: m.subject, text: m.text, html: m.html, headers: m.headers };
    });
    const n = await sendEmailBatch(msgs);
    if (n > 0) {
      sent += n;
      const ids = chunk.map((s: any) => s.id);
      await sql`UPDATE newsletter_subscribers SET last_sent_at = now() WHERE id = ANY(${ids})`;
    }
    await new Promise((r) => setTimeout(r, 700)); // stay under Resend's rate limit
  }

  await sql`
    UPDATE newsletter_issues
    SET recipients = recipients + ${sent}, sent_at = now(),
        investigation_ids = (SELECT array_agg(DISTINCT x) FROM unnest(investigation_ids || ${items.map((i) => i.id)}::int[]) AS x)
    WHERE period = ${period}`;
  return NextResponse.json({ ...base, sent });
}
