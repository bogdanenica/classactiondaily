import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { checkEmail, checkPhone, checkName, checkState, cleanText } from '@/app/lib/validate';
import { sendEmail, emailConfigured, esc } from '@/app/lib/email';
import { SITE_URL, SITE_NAME, OWNER, OWNER_ADDRESS_LINE } from '@/app/lib/site';
import { subscribe, unsubscribeUrl } from '@/app/lib/newsletter';

// Needs the Node runtime for the DNS lookup in validate.ts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const MIN_FILL_SECONDS = 3;          // faster than this is a bot
const MAX_PER_EMAIL_PER_DAY = 3;     // same address, any case
const DEDUPE_WINDOW_HOURS = 24;      // same address + same case = duplicate

// Wording of the confirmation email. Keep the plain-text and HTML versions in step by editing here.
const REVIEW_TEXT_1 =
  'We have received your message. An attorney at {firm} will review it. If we think we may be able to help, we may contact you within the next 30 days. We receive more messages than we can answer individually, so you may not hear from us at all.';
const REVIEW_TEXT_2 =
  'If you have not heard from us within 30 days, please assume we are not able to take your matter. Legal claims have filing deadlines, so do not rely on us to protect your rights in the meantime; consider speaking with another attorney. Submitting this form does not create any obligation for you or for the attorney. If your matter is selected and you and the attorney both decide to work together, you will receive a written engagement letter setting out the terms.';
const NEWSLETTER_TEXT =
  'You also signed up for our monthly email about new investigations we are running.';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Bots get a cheerful "ok" and nothing is saved. Don't tell them why.
function silentOk() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid request.');
  }

  const { caseId, investigationId, consent, newsletter, website, startedAt } = body ?? {};

  // --- Bot guards -----------------------------------------------------------
  if (typeof website === 'string' && website.trim() !== '') return silentOk(); // honeypot
  const started = Number(startedAt);
  if (!Number.isFinite(started) || Date.now() - started < MIN_FILL_SECONDS * 1000) return silentOk();

  // --- Required references --------------------------------------------------
  const caseIdNum = caseId != null ? parseInt(String(caseId), 10) : null;
  const invIdNum = investigationId != null ? parseInt(String(investigationId), 10) : null;
  if ((caseIdNum == null || isNaN(caseIdNum)) && (invIdNum == null || isNaN(invIdNum))) {
    return bad('Missing case or investigation reference.');
  }
  if (!consent) return bad('Please check the consent box so we can contact you.');

  // --- Field validation -----------------------------------------------------
  const nameRes = checkName(body.fullName);
  if (!nameRes.ok) return bad(nameRes.reason);

  const emailRes = await checkEmail(body.email);
  if (!emailRes.ok) return bad(emailRes.reason);

  const phoneRes = checkPhone(body.phone);
  if (!phoneRes.ok) return bad(phoneRes.reason);

  const state = checkState(body.state);
  const description = cleanText(body.description);

  // --- Rate limit + dedupe (by email; no schema changes needed) -------------
  const dayAgo = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  let recent: any[] = [];
  try {
    recent = await sql`
      SELECT case_id, investigation_id FROM leads
      WHERE lower(email) = ${emailRes.email} AND created_at >= ${dayAgo}::timestamptz
    `;
  } catch (err) {
    // Most likely the leads table has no created_at column. Don't block the
    // submission over a rate-limit lookup; just log it.
    console.warn('[leads] rate-limit lookup failed (is there a created_at column?):', err);
  }
  if (recent.length >= MAX_PER_EMAIL_PER_DAY) {
    return bad('You have already submitted several requests today. We have your information and will be in touch.', 429);
  }
  const duplicate = recent.some(
    (r: any) =>
      (caseIdNum != null && r.case_id === caseIdNum) ||
      (invIdNum != null && r.investigation_id === invIdNum),
  );

  // --- What are they writing about? (for the emails) ------------------------
  let subjectLabel = 'Inquiry';
  let subjectUrl = SITE_URL;
  let defendant: string | null = null;
  if (caseIdNum != null && !isNaN(caseIdNum)) {
    const rows = await sql`SELECT case_name, defendant, court_name, docket_number FROM cases WHERE id = ${caseIdNum}`;
    if (rows[0]) {
      subjectLabel = rows[0].case_name;
      defendant = rows[0].defendant;
      subjectUrl = `${SITE_URL}/cases/${caseIdNum}`;
    }
  } else if (invIdNum != null && !isNaN(invIdNum)) {
    const rows = await sql`SELECT title, defendant FROM investigations WHERE id = ${invIdNum}`;
    if (rows[0]) {
      subjectLabel = rows[0].title;
      defendant = rows[0].defendant;
      subjectUrl = `${SITE_URL}/investigations/${invIdNum}`;
    }
  }

  // --- Save -----------------------------------------------------------------
  try {
    await sql`
      INSERT INTO leads (
        case_id, investigation_id, full_name, email, phone, state, description, consent_given
      ) VALUES (
        ${caseIdNum ?? null}, ${invIdNum ?? null},
        ${nameRes.name}, ${emailRes.email}, ${phoneRes.display ?? null}, ${state},
        ${description}, ${true}
      )
    `;
  } catch (err: any) {
    console.error('[leads] insert failed:', err);
    return bad('Something went wrong saving your information. Please try again or email us directly.', 500);
  }

  // --- Newsletter sign-up (only if they left the box checked) ----------------
  let subscribed = false;
  let unsubLink: string | null = null;
  if (newsletter === true) {
    const token = await subscribe({
      email: emailRes.email,
      name: nameRes.name,
      state,
      source: caseIdNum != null && !isNaN(caseIdNum) ? `case:${caseIdNum}` : `investigation:${invIdNum}`,
    });
    if (token) {
      subscribed = true;
      unsubLink = unsubscribeUrl(token);
    }
  }

  // --- Notify (never fails the request) ------------------------------------
  const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
  let notified = false;
  let acknowledged = false;

  if (!duplicate && emailConfigured()) {
    const to = process.env.LEADS_TO_EMAIL || OWNER.email;
    const rows = [
      ['Name', nameRes.name],
      ['Email', emailRes.email],
      ['Phone', phoneRes.display ?? 'not given'],
      ['State', state ?? 'not given'],
      ['Regarding', subjectLabel],
      ['Defendant', defendant ?? 'not identified'],
      ['Submitted', submittedAt],
      ['Newsletter', subscribed ? 'subscribed' : 'no'],
      ['Email domain accepts mail', 'yes (DNS verified)'],
    ];
    const tableHtml = rows
      .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${esc(v)}</td></tr>`)
      .join('');
    const descHtml = description
      ? `<h3 style="margin:20px 0 6px;font-size:14px;color:#333">What they wrote</h3><div style="white-space:pre-wrap;border-left:3px solid #ddd;padding:8px 12px;color:#222">${esc(description)}</div>`
      : `<p style="color:#666;margin-top:16px">No description provided.</p>`;

    notified = await sendEmail({
      to,
      replyTo: emailRes.email,
      subject: `New lead: ${nameRes.name}: ${subjectLabel}`,
      text:
        `New intake submission on ${SITE_NAME}\n\n` +
        rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
        `\n\nPage: ${subjectUrl}\n\n` +
        (description ? `What they wrote:\n${description}\n` : 'No description provided.\n') +
        `\nReply to this email to respond directly to ${nameRes.name}.`,
      html:
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:640px">` +
        `<h2 style="margin:0 0 12px;font-size:18px">New intake submission</h2>` +
        `<table style="border-collapse:collapse;font-size:15px">${tableHtml}</table>` +
        `<p style="margin:14px 0 0"><a href="${esc(subjectUrl)}">${esc(subjectUrl)}</a></p>` +
        descHtml +
        `<p style="margin-top:22px;color:#666;font-size:13px">Reply to this email to respond directly to ${esc(nameRes.name)}. Lead saved to the database.</p>` +
        `</div>`,
    });

    acknowledged = await sendEmail({
      to: emailRes.email,
      replyTo: to,
      subject: `We received your message: ${SITE_NAME}`,
      text:
        `Hello ${nameRes.name},\n\n` +
        `Thank you for contacting ${SITE_NAME} about:\n${subjectLabel}\n${subjectUrl}\n\n` +
        `${REVIEW_TEXT_1.replace('{firm}', OWNER.firm)}\n\n${REVIEW_TEXT_2}\n\n` +
        (subscribed && unsubLink ? `${NEWSLETTER_TEXT} Unsubscribe at any time: ${unsubLink}\n\n` : '') +
        `${OWNER.firm}\n${OWNER.name}\n${OWNER_ADDRESS_LINE}\n${OWNER.email} · ${OWNER.phoneDisplay}\n\n` +
        `Attorney advertising. Submitting a form does not create an attorney-client relationship, and no lawyer represents you unless and until you sign a written engagement agreement. Please do not send confidential or time-sensitive information by email until representation has been confirmed. If you did not submit this form, you can ignore this message; we will not contact you again.`,
      html:
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:600px">` +
        `<p>Hello ${esc(nameRes.name)},</p>` +
        `<p>Thank you for contacting ${esc(SITE_NAME)} about:<br><strong>${esc(subjectLabel)}</strong><br><a href="${esc(subjectUrl)}">${esc(subjectUrl)}</a></p>` +
        `<p>${esc(REVIEW_TEXT_1.replace('{firm}', OWNER.firm))}</p><p>${esc(REVIEW_TEXT_2)}</p>` +
        (subscribed && unsubLink ? `<p>${esc(NEWSLETTER_TEXT)} <a href="${unsubLink}">Unsubscribe at any time</a>.</p>` : '') +
        `<p style="margin-top:20px">${esc(OWNER.firm)}<br>${esc(OWNER.name)}<br>${esc(OWNER_ADDRESS_LINE)}<br>${esc(OWNER.email)} · ${esc(OWNER.phoneDisplay)}</p>` +
        `<p style="margin-top:20px;font-size:12px;color:#666">Attorney advertising. Submitting a form does not create an attorney-client relationship, and no lawyer represents you unless and until you sign a written engagement agreement. Please do not send confidential or time-sensitive information by email until representation has been confirmed. If you did not submit this form, you can ignore this message; we will not contact you again.</p>` +
        `</div>`,
    });
  }

  return NextResponse.json({ ok: true, duplicate, notified, acknowledged, subscribed });
}
