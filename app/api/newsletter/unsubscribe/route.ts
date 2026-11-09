import { unsubscribe } from '@/app/lib/newsletter';
import { SITE_NAME, SITE_URL, OWNER } from '@/app/lib/site';

// Unsubscribe link target.
//   GET  shows a one-button confirmation page. (Mail scanners open links in
//        emails automatically; requiring a click keeps them from unsubscribing
//        people by accident.)
//   POST does the unsubscribe. Mail apps with a built-in "Unsubscribe" button
//        send this POST directly (RFC 8058 one-click).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | ${SITE_NAME}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;max-width:520px;margin:12vh auto;padding:0 20px;line-height:1.55">
<h1 style="font-size:22px">${title}</h1>${body}
<p style="margin-top:28px;font-size:13px;color:#666"><a href="${SITE_URL}" style="color:#666">${SITE_NAME}</a> · ${OWNER.firm}</p>
</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get('t') ?? '';
  if (t.length < 16) return page('Link not recognized', '<p>This unsubscribe link is incomplete. Reply to any of our emails and we will remove you by hand.</p>', 400);
  return page(
    'Unsubscribe from the monthly email?',
    `<form method="post" action="/api/newsletter/unsubscribe?t=${encodeURIComponent(t)}">
<p>You will stop receiving the monthly email about new investigations. This does not affect any form you submitted.</p>
<button type="submit" style="font-size:16px;padding:10px 18px;border:0;border-radius:4px;background:#111;color:#fff;cursor:pointer">Unsubscribe</button>
</form>`,
  );
}

export async function POST(request: Request) {
  const t = new URL(request.url).searchParams.get('t') ?? '';
  let ok = false;
  try {
    ok = await unsubscribe(t);
  } catch (err) {
    console.error('[newsletter] unsubscribe failed:', err);
    return page('Something went wrong', `<p>We could not process this just now. Email <a href="mailto:${OWNER.email}">${OWNER.email}</a> and we will remove you by hand.</p>`, 500);
  }
  if (!ok) return page('Link not recognized', `<p>We could not find a subscription for this link. Email <a href="mailto:${OWNER.email}">${OWNER.email}</a> and we will remove you by hand.</p>`, 404);
  return page('You are unsubscribed', '<p>You will not receive the monthly email again.</p>');
}
