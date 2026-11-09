import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { SITE_URL, SITE_NAME, OWNER, OWNER_ADDRESS_LINE, snippet } from './site';
import { esc } from './email';

// Newsletter plumbing shared by the intake form (sign-up), the unsubscribe
// route, and the monthly send in app/api/cron/newsletter.

const sql = neon(process.env.DATABASE_URL!);

export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;
}

/**
 * Add (or re-activate) a subscriber. Returns the unsubscribe token, or null if
 * the table does not exist yet or the write failed. Never throws: a newsletter
 * problem must not cost us a lead.
 */
export async function subscribe(input: { email: string; name?: string | null; state?: string | null; source?: string | null }): Promise<string | null> {
  try {
    const token = randomBytes(24).toString('hex');
    const rows = await sql`
      INSERT INTO newsletter_subscribers (email, full_name, state, source, token)
      VALUES (${input.email.toLowerCase()}, ${input.name ?? null}, ${input.state ?? null}, ${input.source ?? null}, ${token})
      ON CONFLICT (email) DO UPDATE
        SET unsubscribed_at = NULL,
            full_name = COALESCE(EXCLUDED.full_name, newsletter_subscribers.full_name),
            state = COALESCE(EXCLUDED.state, newsletter_subscribers.state)
      RETURNING token
    `;
    return rows[0]?.token ?? null;
  } catch (err) {
    console.warn('[newsletter] subscribe failed (has neon-status-newsletter-setup.sql been run?):', err);
    return null;
  }
}

/** Returns true if a subscriber with this token existed. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const rows = await sql`
    UPDATE newsletter_subscribers
    SET unsubscribed_at = COALESCE(unsubscribed_at, now())
    WHERE token = ${token}
    RETURNING id
  `;
  return rows.length > 0;
}

export type NewsletterItem = {
  id: number;
  title: string;
  defendant: string | null;
  category: string | null;
  allegation: string | null;
};

const ADVERTISING_LINE =
  'Attorney advertising. This email is not legal advice and does not create an attorney-client relationship. An investigation is not a finding that any company did anything wrong.';

/** Build one subscriber's copy of the monthly email. */
export function renderNewsletter(items: NewsletterItem[], opts: { monthLabel: string; token: string; name?: string | null }) {
  const unsub = unsubscribeUrl(opts.token);
  const n = items.length;
  const subject = `${n} new ${n === 1 ? 'investigation' : 'investigations'} this month: ${SITE_NAME}`;
  const hello = opts.name ? `Hello ${opts.name.split(' ')[0]},` : 'Hello,';
  const intro = `Here ${n === 1 ? 'is the investigation' : `are the ${n} investigations`} ${OWNER.firm} opened in the past month. If one of them describes something that happened to you, open it and tell us about it.`;

  const text =
    `${hello}\n\n${intro}\n\n` +
    items.map((it) =>
      `${it.title}\n` +
      (it.defendant ? `Company: ${it.defendant}\n` : '') +
      (it.allegation ? `${snippet(it.allegation, 280)}\n` : '') +
      `${SITE_URL}/investigations/${it.id}\n`,
    ).join('\n') +
    `\nAll open investigations: ${SITE_URL}/investigations\n\n` +
    `${OWNER.firm}\n${OWNER.name}\n${OWNER_ADDRESS_LINE}\n${OWNER.phoneDisplay}\n\n` +
    `${ADVERTISING_LINE}\n\n` +
    `You are receiving this monthly email because you chose to when you submitted a form on ${SITE_NAME}. Unsubscribe: ${unsub}\n`;

  const itemsHtml = items.map((it) =>
    `<div style="border-top:1px solid #e5e5e5;padding:16px 0">` +
    `<div style="font-size:17px;font-weight:600;line-height:1.35"><a href="${SITE_URL}/investigations/${it.id}" style="color:#111;text-decoration:none">${esc(it.title)}</a></div>` +
    (it.defendant ? `<div style="font-size:13px;color:#666;margin-top:2px">${esc(it.defendant)}${it.category ? ` · ${esc(it.category)}` : ''}</div>` : '') +
    (it.allegation ? `<div style="margin-top:8px;color:#222">${esc(snippet(it.allegation, 280))}</div>` : '') +
    `<div style="margin-top:10px"><a href="${SITE_URL}/investigations/${it.id}" style="color:#0b57d0">Read more or tell us what happened to you</a></div>` +
    `</div>`,
  ).join('');

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:600px">` +
    `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#666">${esc(SITE_NAME)} · ${esc(opts.monthLabel)}</div>` +
    `<h1 style="font-size:22px;margin:6px 0 14px">New investigations this month</h1>` +
    `<p>${esc(hello)}</p><p>${esc(intro)}</p>` +
    itemsHtml +
    `<div style="border-top:1px solid #e5e5e5;padding-top:16px"><a href="${SITE_URL}/investigations" style="color:#0b57d0">See all open investigations</a></div>` +
    `<p style="margin-top:22px">${esc(OWNER.firm)}<br>${esc(OWNER.name)}<br>${esc(OWNER_ADDRESS_LINE)}<br>${esc(OWNER.phoneDisplay)}</p>` +
    `<p style="margin-top:18px;font-size:12px;color:#666">${esc(ADVERTISING_LINE)}</p>` +
    `<p style="font-size:12px;color:#666">You are receiving this monthly email because you chose to when you submitted a form on ${esc(SITE_NAME)}. <a href="${unsub}" style="color:#666">Unsubscribe</a>.</p>` +
    `</div>`;

  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
