import { promises as dns } from 'node:dns';
import { US_STATES } from './states';

// Validation helpers for the intake form. Everything here runs on the server.

// Throwaway-email providers. Not exhaustive, but catches the common ones.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonbox.net', 'dispostable.com',
  'fakeinbox.com', 'getnada.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'inboxbear.com', 'mailinator.com', 'mailinator.net', 'maildrop.cc',
  'mailnesia.com', 'mintemail.com', 'mohmal.com', 'mytemp.email', 'sharklasers.com', 'spamgourmet.com',
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'trashmail.com',
  'yopmail.com', 'yopmail.fr', 'emailondeck.com', 'burnermail.io', 'tempail.com', 'mailsac.com',
]);

// Obviously fake patterns people type to get past a form.
const JUNK_LOCAL_PARTS = /^(test|asdf|qwerty|abc|xyz|none|fake|noemail|no|na|n\/a|aaa+|zzz+|123+)$/i;
const JUNK_DOMAINS = /^(test|example|fake|none|email|mail|domain|asdf|abc)\.(com|net|org|test)$/i;

export type EmailCheck = { ok: true; email: string; domain: string; mx: boolean } | { ok: false; reason: string };

export async function checkEmail(raw: unknown): Promise<EmailCheck> {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return { ok: false, reason: 'Please enter a valid email address.' };

  // Practical RFC-ish check: one @, sane local part, domain with a dot and a real TLD.
  const m = email.match(/^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  if (!m) return { ok: false, reason: 'Please enter a valid email address.' };
  const [, local, domain] = m;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { ok: false, reason: 'Please enter a valid email address.' };
  }
  const tld = domain.split('.').pop()!;
  if (tld.length < 2 || /^\d+$/.test(tld)) return { ok: false, reason: 'Please enter a valid email address.' };

  if (JUNK_LOCAL_PARTS.test(local) || JUNK_DOMAINS.test(domain)) {
    return { ok: false, reason: 'Please enter the email address you actually use — we will send a confirmation there.' };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: 'Temporary email addresses are not accepted. Please use a permanent one.' };
  }

  // Does the domain accept mail? MX records first, A/AAAA as a fallback
  // (some small domains receive mail on their A record).
  let mx = false;
  try {
    const records = await withTimeout(dns.resolveMx(domain), 4000);
    mx = Array.isArray(records) && records.length > 0;
  } catch {
    mx = false;
  }
  if (!mx) {
    try {
      const a = await withTimeout(dns.resolve4(domain), 3000);
      mx = Array.isArray(a) && a.length > 0;
    } catch {
      mx = false;
    }
  }
  if (!mx) {
    return { ok: false, reason: `We couldn't find a mail server for "${domain}". Please check the spelling.` };
  }

  return { ok: true, email, domain, mx: true };
}

export type PhoneCheck = { ok: true; phone: string | null; display: string | null } | { ok: false; reason: string };

/** Optional field. If provided, must be a 10-digit North American number. */
export function checkPhone(raw: unknown): PhoneCheck {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, phone: null, display: null };
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, reason: 'Please enter a 10-digit U.S. phone number, or leave it blank.' };
  if (/^(\d)\1{9}$/.test(digits) || digits === '1234567890' || digits.startsWith('555')) {
    return { ok: false, reason: 'That phone number does not look real. Please check it or leave it blank.' };
  }
  const display = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return { ok: true, phone: `+1${digits}`, display };
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

export function checkName(raw: unknown): NameCheck {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120) return { ok: false, reason: 'Please enter your full name.' };
  if (!/[a-z]/i.test(name)) return { ok: false, reason: 'Please enter your full name.' };
  if (/^(test|asdf|qwerty|abc|none|na|n\/a|xxx+|aaa+)$/i.test(name)) return { ok: false, reason: 'Please enter your full name.' };
  if (/https?:\/\/|www\./i.test(name)) return { ok: false, reason: 'Please enter your full name.' };
  return { ok: true, name };
}

export function cleanText(raw: unknown, max = 5000): string | null {
  const s = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function checkState(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const hit = US_STATES.find((st) => st.toLowerCase() === s.toLowerCase());
  return hit ?? s.slice(0, 60);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
