import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '../components/JsonLd';
import { SITE_URL, SITE_NAME, OWNER, OWNER_ADDRESS_LINE } from '../lib/site';

export const metadata: Metadata = {
  title: { absolute: 'About ClassActionDaily: who runs it and how it works' },
  description: `ClassActionDaily is published by ${OWNER.firm} (${OWNER.name}, Florida Bar No. ${OWNER.barFlorida}). Learn how we source, summarize, and publish newly filed consumer class actions.`,
  alternates: { canonical: '/about' },
};

const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': `${SITE_URL}/about#owner`,
  name: 'Bogdan Enica',
  honorificSuffix: 'Esq.',
  jobTitle: 'Attorney',
  worksFor: { '@id': `${SITE_URL}/contact#firm` },
  email: OWNER.email,
  telephone: OWNER.phoneE164,
  url: `${SITE_URL}/about`,
  hasCredential: OWNER.admissions.map((a) => ({
    '@type': 'EducationalOccupationalCredential',
    credentialCategory: 'Bar admission',
    name: a,
  })),
};

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginTop: 12 }}>{children}</p>
);
const H2 = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <h2 id={id} style={{ fontSize: 18, marginTop: 28, marginBottom: 4 }}>{children}</h2>
);

export default function About() {
  return (
    <div className="single-col">
      <JsonLd data={personSchema} />
      <div className="breadcrumb"><Link href="/">Home</Link> › About</div>
      <h1 style={{ marginBottom: 8 }}>About {SITE_NAME}</h1>
      <P>
        {SITE_NAME} tracks newly filed consumer class action complaints in U.S. courts and publishes plain-English summaries of them. It is a free public resource; no account or payment is ever required to read it.
      </P>

      <H2 id="who">Who runs this site</H2>
      <P>
        {SITE_NAME} is published and maintained by <strong>{OWNER.firm}</strong>, a law firm located at {OWNER_ADDRESS_LINE}. The attorney responsible for the site&apos;s content and for compliance with attorney-advertising rules is <strong>{OWNER.name}</strong>, Florida Bar No. {OWNER.barFlorida}.
      </P>
      <P>
        Mr. Enica is admitted to practice in {OWNER.admissions.join('; ')}. You can reach him directly at <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> or <a href={`tel:${OWNER.phoneE164}`}>{OWNER.phoneDisplay}</a>. See the <Link href="/contact">contact page</Link> for mailing address and hours.
      </P>

      <H2 id="how">How it works</H2>
      <P>
        The site has two distinct sections. <strong>Latest Cases</strong> are filed complaints. Most are found automatically each morning on CourtListener, a free public-records database maintained by the non-profit Free Law Project. Our software reads the complaint when it is available and generates a summary using an AI language model; until the complaint can be read, the page shows only how the court docket classifies the case. Cases that are not consumer class actions are left out. Some cases, including cases filed in state courts, are added by an attorney at {OWNER.firm}. A case marked with a star (<span style={{ color: 'var(--accent)' }} aria-hidden="true">★</span>) has a summary that an attorney reviewed before publication. All other summaries are published without attorney review.
      </P>
      <P>
        <strong>Investigations</strong> are different: they are editorially curated, pre-litigation inquiries where attorneys are evaluating whether a class action can be brought. No suit has been filed. Investigations appear and update only when a lawyer at {OWNER.firm} opens one. Submissions help determine whether a case is viable.
      </P>

      <H2 id="accuracy">Accuracy and limitations</H2>
      <P>
        Because most case summaries are machine-generated, they can contain mistakes: a mis-identified defendant, a mischaracterized claim, or a stale status. A star means an attorney reviewed the summary for accuracy; it is not an opinion about the merits of the case. The court record is the authoritative source, and case pages link to it where a public docket is available. If you spot an error, please <Link href="/contact">tell us</Link> and we will correct or remove the entry.
      </P>
      <P>
        The inclusion of a company on this site means only that a complaint naming it was filed in court. A complaint contains unproven allegations. It does not mean the company did anything wrong, and nothing on this site should be read as a statement that it did.
      </P>

      <H2 id="sources">Source of data</H2>
      <P>
        Case information comes from CourtListener (<a href="https://www.courtlistener.com" target="_blank" rel="noopener noreferrer">courtlistener.com</a>) and, through it, the federal judiciary&apos;s PACER system; from state court filings; and from other public sources. Each case page names its own source. We do not host complaint PDFs.
      </P>

      <H2 id="disclosures">Disclosures: what happens when you submit a form</H2>
      <P>
        This website is attorney advertising. When you submit an intake form on a case or investigation page, your information is received by {OWNER.firm}. Depending on the subject matter and where you live, we may review it ourselves or forward it to co-counsel or another plaintiffs&apos; firm with an active practice in that area. Submitting a form does not create an attorney-client relationship with anyone, and no lawyer will represent you unless and until you sign a written engagement agreement. Our <Link href="/privacy">privacy policy</Link> explains exactly what we collect and how it is used.
      </P>
      <P>
        {SITE_NAME} does not charge consumers anything, does not sell your information to third parties, and is not a lawyer-referral service within the meaning of Florida Bar Rule 4-7.22.
      </P>

      <H2 id="contact">Questions, corrections, and removal requests</H2>
      <P>
        Email <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> or use the <Link href="/contact">contact page</Link>. We respond to correction and removal requests within five business days.
      </P>
    </div>
  );
}
