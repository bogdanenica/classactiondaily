// Thin wrapper around Resend's REST API. No SDK needed.
//
// Env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY    from resend.com → API Keys
//   LEADS_TO_EMAIL    where lead notifications go, e.g. bogdan@uscaclassaction.com
//   LEADS_FROM_EMAIL  the sender, e.g. "ClassActionDaily <leads@classactiondaily.com>"
//                     (domain must be verified in Resend; before that, use
//                     "ClassActionDaily <onboarding@resend.dev>" for testing —
//                     it can only deliver to the Resend account owner's address)
//
// If RESEND_API_KEY is missing, sendEmail logs and returns false instead of
// throwing, so the lead is still saved and the form still succeeds.

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.LEADS_FROM_EMAIL);
}

export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEADS_FROM_EMAIL;
  if (!key || !from) {
    console.warn('[email] RESEND_API_KEY or LEADS_FROM_EMAIL not set; skipping send:', msg.subject);
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      reply_to: msg.replyTo,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[email] Resend ${res.status}: ${detail.slice(0, 300)}`);
    return false;
  }
  return true;
}

/** Escape user-supplied text before putting it in HTML email. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
