'use client';

import { useState } from 'react';

type Props = {
  caseId?: number;
  investigationId?: number;
  productHint?: string;
};

export default function IntakeForm({ caseId, investigationId, productHint }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      caseId,
      investigationId,
      fullName: form.get('fullName'),
      email: form.get('email'),
      phone: form.get('phone'),
      state: form.get('state'),
      description: form.get('description'),
      consent: form.get('consent') === 'on',
    };
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
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
          Your submission has been received. A participating attorney will review your information and may contact you within 5 business days. There is no obligation.
        </div>
      </div>
    );
  }

  return (
    <div className="intake">
      <h2>Were you affected?</h2>
      <p className="lead">A participating attorney may be able to evaluate your claim at no cost to you.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" type="text" required placeholder="Jane Doe" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required placeholder="jane@example.com" />

        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />

        <label htmlFor="state">State of residence</label>
        <input id="state" name="state" type="text" placeholder="e.g., California" />

        <label htmlFor="description">Briefly describe your experience</label>
        <textarea id="description" name="description" placeholder={productHint || 'When did this happen? What harm did you experience?'} />

        <div className="consent">
          <input id="consent" name="consent" type="checkbox" required />
          <label htmlFor="consent">
            I consent to be contacted by a participating attorney about my potential claim. Submitting this form does not create an attorney-client relationship.
          </label>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>

        {error && <div className="error">{error}</div>}

        <p className="ad-disclaimer">
          Attorney advertising. Not a referral service. Submissions are forwarded to a participating plaintiffs' firm.
        </p>
      </form>
    </div>
  );
}