import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import JsonLd from "./components/JsonLd";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  OWNER,
  OWNER_ADDRESS_LINE,
} from "./lib/site";

export const metadata: Metadata = {
  // metadataBase makes every relative URL in child metadata (OG images, canonicals) absolute.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: OWNER.name, url: `${SITE_URL}/about` }],
  publisher: OWNER.firm,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      email: OWNER.email,
      telephone: OWNER.phoneE164,
      address: {
        "@type": "PostalAddress",
        streetAddress: OWNER.address.street,
        addressLocality: OWNER.address.city,
        addressRegion: OWNER.address.state,
        postalCode: OWNER.address.zip,
        addressCountry: OWNER.address.country,
      },
      founder: { "@id": `${SITE_URL}/about#owner` },
      parentOrganization: { "@id": `${SITE_URL}/contact#firm` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <html lang="en">
      <body>
        <JsonLd data={organizationSchema} />
        <header className="site-header">
          <div className="top-strip">
            <strong>Attorney Advertising.</strong> Information on this site does not create an attorney-client relationship. Prior results do not guarantee outcomes.
          </div>
          <div className="header-inner">
            <Link href="/" className="logo">Class<span>Action</span>Daily</Link>
            <nav className="main-nav" aria-label="Primary">
              <Link href="/">Latest Cases</Link>
              <Link href="/investigations">Investigations</Link>
              <Link href="/categories">Categories</Link>
              <Link href="/defendants">Defendants</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <div className="brand">Class<span>Action</span>Daily</div>
              <p style={{ fontSize: 13, color: "#8b96a3", marginTop: 8 }}>
                Tracking new consumer class actions filed in U.S. federal courts. Updated daily.
              </p>
              <p style={{ fontSize: 13, color: "#8b96a3", marginTop: 12, lineHeight: 1.5 }}>
                Published by <strong style={{ color: "#c9d1da" }}>{OWNER.firm}</strong><br />
                {OWNER.name}<br />
                {OWNER_ADDRESS_LINE}<br />
                <a href={`tel:${OWNER.phoneE164}`}>{OWNER.phoneDisplay}</a> · <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>
              </p>
            </div>
            <div>
              <h5>Sections</h5>
              <Link href="/">Latest cases</Link>
              <Link href="/investigations">Investigations</Link>
              <Link href="/categories">Categories</Link>
              <Link href="/defendants">Defendants</Link>
            </div>
            <div>
              <h5>About</h5>
              <Link href="/about">How it works</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div>
              <h5>Legal</h5>
              <Link href="/privacy">Privacy policy</Link>
              <Link href="/terms">Terms of use</Link>
              <Link href="/about#disclosures">Disclosures</Link>
            </div>
          </div>
          <div className="legal-disclaimer">
            <strong>Attorney advertising.</strong> The content on this site is for general informational purposes only and does not constitute legal advice. No attorney-client relationship is formed by use of this site or submission of any form. Prior results do not guarantee a similar outcome. Case summaries are generated automatically from public court records and may contain errors; consult the original docket entry on CourtListener for authoritative information. ClassActionDaily is published by {OWNER.firm}, {OWNER_ADDRESS_LINE}. Responsible attorney: {OWNER.name}, Florida Bar No. {OWNER.barFlorida}. © {year} {OWNER.firm}. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
