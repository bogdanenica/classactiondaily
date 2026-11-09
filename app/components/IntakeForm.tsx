'use client';

import { useRef, useState } from 'react';
import { US_STATES } from '../lib/states';

// Whether the newsletter box starts checked. Flip to false to make sign-up a
// deliberate opt-in.
const NEWSLETTER_DEFAULT_CHECKED = true;

type Props = {
  caseId?: number;
  investigationId?: number;
  productHint?: string;
};

export default function IntakeForm({ caseId, investigationId, productHint }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recorded when the form first renders; the server rejects anything submitted
  // suspiciously fast after this.
  const startedAt = useRef<number>(Date.now());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();

    // Quick client-side checks so people get instant feedback. The server
    // re-checks everything, so these are a courtesy, not the guard.
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (phone && phone.replace(/\D/g, '').replace(/^1/, '').length !== 10) {
      setError('Please enter a 10-digit U.S. phone number, or leave it blank.');
      return;
    }

    setSubmitting(true);
    const payload = {
      caseId,
      investigationId,
      fullName: form.get('fullName'),
      email,
      phone,
      state: form.get('state'),
      description: form.get('description'),
      consent: form.get('consent') === 'on',
      newsletter: form.get('newsletter') === 'on',
      website: form.get('website'), // honeypot: humans never see this field
      startedAt: startedAt.current,
    };

    let res: Response;
    let data: any = {};
    try {
      res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setSubmitting(false);
      setError('Network problem. Please check your connection and try again.');
      return;
    }

    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong. Please try again.');
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="intake">
        <h2>Thank you</h2>
        <div className="success">
          Your message has been received. We have sent a confirmation to your email address. If you don&apos;t see it within a few minutes, check your spam folder. An attorney will review your message and may contact you within the next 30 days. We cannot respond to everyone, so you may not hear from us at all. There is no obligation.
        </div>
      </div>
    );
  }

  return (
    <div className="intake">
      <h2>Were you affected?</h2>
      <p className="lead">An attorney may be able to evaluate your claim at no cost to you.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" type="text" required minLength={2} maxLength={120} autoComplete="name" placeholder="Jane Doe" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="jane@example.com" />

        <label htmlFor="phone">Phone <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span></label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 123-4567" />

        <label htmlFor="state">State of residence</label>
        <input id="state" name="state" type="text" list="us-states" autoComplete="address-level1" placeholder="e.g., California" />
        <datalist id="us-states">
          {US_STATES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <label htmlFor="description">Briefly describe your experience</label>
        <textarea id="description" name="description" maxLength={5000} placeholder={productHint || 'When did this happen? What harm did you experience?'} />

        {/* Honeypot: hidden from people, irresistible to bots. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="consent">
          <input id="consent" name="consent" type="checkbox" required />
          <label htmlFor="consent">
            I consent to be contacted by an attorney about my potential claim. Submitting this form does not create an attorney-client relationship.
          </label>
        </div>

        <div className="consent">
          <input id="newsletter" name="newsletter" type="checkbox" defaultChecked={NEWSLETTER_DEFAULT_CHECKED} />
          <label htmlFor="newsletter">
            Send me a monthly email about new investigations. Unsubscribe at any time.
          </label>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>

        {error && <div className="error" role="alert">{error}</div>}

        <p className="ad-disclaimer">
          Attorney advertising. Not a referral service. Your information goes to Access Law Group and may be shared with co-counsel. See our <a href="/privacy">privacy policy</a>.
        </p>
      </form>
    </div>
  );
}
