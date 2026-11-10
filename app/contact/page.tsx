import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '../components/JsonLd';
import { SITE_URL, SITE_NAME, OWNER, OWNER_ADDRESS_LINE } from '../lib/site';

export const metadata: Metadata = {
  title: { absolute: 'Contact ClassActionDaily | Access Law Group' },
  description: `Contact ${OWNER.firm}, publisher of ${SITE_NAME}. ${OWNER_ADDRESS_LINE}. Phone ${OWNER.phoneDisplay}. Email ${OWNER.email}. Corrections, removal requests, and case inquiries.`,
  alternates: { canonical: '/contact' },
};

const firmSchema = {
  '@context': 'https://schema.org',
  '@type': 'LegalService',
  '@id': `${SITE_URL}/contact#firm`,
  name: OWNER.firm,
  url: SITE_URL,
  email: OWNER.email,
  telephone: OWNER.phoneE164,
  address: {
    '@type': 'PostalAddress',
    streetAddress: OWNER.address.street,
    addressLocality: OWNER.address.city,
    addressRegion: OWNER.address.state,
    postalCode: OWNER.address.zip,
    addressCountry: OWNER.address.country,
  },
  areaServed: ['US'],
  founder: { '@id': `${SITE_URL}/about#owner` },
  employee: { '@id': `${SITE_URL}/about#owner` },
  priceRange: 'Free consultation',
  knowsAbout: ['Class actions', 'Consumer protection', 'False advertising', 'Privacy litigation'],
};

const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 16 }}>{children}</div>
  </div>
);

export default function Contact() {
  return (
    <div className="single-col">
      <JsonLd data={firmSchema} />
      <div className="breadcrumb"><Link href="/">Home</Link> › Contact</div>
      <h1 style={{ marginBottom: 8 }}>Contact</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginBottom: 28 }}>
        {SITE_NAME} is published by {OWNER.firm}. Use the details below for corrections, removal requests, press inquiries, or questions about a case or investigation listed on this site.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32, maxWidth: 760 }}>
        <div>
          <Cell label="Publisher">{OWNER.firm}</Cell>
          <Cell label="Responsible attorney">{OWNER.name}<br /><span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Florida Bar No. {OWNER.barFlorida}</span></Cell>
          <Cell label="Mailing address">
            <address style={{ fontStyle: 'normal', lineHeight: 1.5 }}>
              {OWNER.firm}<br />
              {OWNER.address.street}<br />
              {OWNER.address.city}, {OWNER.address.state} {OWNER.address.zip}
            </address>
          </Cell>
        </div>
        <div>
          <Cell label="Email"><a href={`mailto:${OWNER.email}`}>{OWNER.email}</a></Cell>
          <Cell label="Phone"><a href={`tel:${OWNER.phoneE164}`}>{OWNER.phoneDisplay}</a></Cell>
          <Cell label="Bar admissions">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
              {OWNER.admissions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </Cell>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 36, marginBottom: 8 }}>Corrections and removal requests</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        Most case summaries on this site are generated automatically from public court records, and any summary may contain errors. If you are a party, counsel, or a company named in a listing and believe something is inaccurate, email <a href={`mailto:${OWNER.email}?subject=Correction%20request%20-%20ClassActionDaily`}>{OWNER.email}</a> with the case URL and a short description of the problem. We review every request and respond within five business days. Where a correction is warranted we will amend or remove the entry.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 8 }}>About a case you were affected by</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        The fastest route is the form on the individual case or investigation page; it captures the details we need to evaluate your situation. You can also email or call. Please do not send confidential or time-sensitive information until a lawyer has confirmed in writing that the firm represents you; see our <Link href="/terms">terms of use</Link>.
      </p>

      <p style={{ fontSize: 13, color: 'var(--ink-muted)', maxWidth: 680, marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        Attorney advertising. Contacting us does not create an attorney-client relationship. The hiring of a lawyer is an important decision that should not be based solely upon advertisements.
      </p>
    </div>
  );
}
