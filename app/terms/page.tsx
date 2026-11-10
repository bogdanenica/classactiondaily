import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL, OWNER, OWNER_ADDRESS_LINE } from '../lib/site';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: `Terms governing use of ${SITE_NAME}, published by ${OWNER.firm}: informational purpose, no legal advice, accuracy of automated summaries, intake submissions, and limitations.`,
  alternates: { canonical: '/terms' },
};

const EFFECTIVE_DATE = 'October 30, 2026';

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 6 }}>{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ color: 'var(--ink-soft)', maxWidth: 720, marginTop: 10, lineHeight: 1.6 }}>{children}</p>
);

export default function Terms() {
  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/">Home</Link> › Terms of use</div>
      <h1 style={{ marginBottom: 4 }}>Terms of use</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Effective {EFFECTIVE_DATE}</p>

      <P>
        These terms govern your use of {SITE_NAME} (the &ldquo;Site,&rdquo; at {SITE_URL}), published by {OWNER.firm} (&ldquo;we,&rdquo; &ldquo;us&rdquo;), {OWNER_ADDRESS_LINE}. By using the Site you agree to them. If you do not agree, please do not use the Site.
      </P>

      <H2>1. Attorney advertising; informational purpose only</H2>
      <P>This Site is attorney advertising. Its content is provided for general informational purposes and is not legal advice. Reading the Site, submitting a form, or contacting us does not create an attorney-client relationship, and no such relationship exists unless and until you and a lawyer sign a written engagement agreement. The hiring of a lawyer is an important decision that should not be based solely upon advertisements. Prior results do not guarantee a similar outcome.</P>

      <H2>2. Nature of the content</H2>
      <P>Case listings describe <strong>complaints</strong>: documents filed by plaintiffs that contain unproven allegations. A company&apos;s appearance on this Site means only that a complaint naming it was filed in a U.S. court. It is not a finding, and should not be read as a statement, that the company did anything wrong. Many class actions are dismissed, settled without any admission, or never certified.</P>
      <P>Unless a case is marked with a star, its summary is generated automatically by software from public court records and is published without attorney review. A star means an attorney reviewed the summary before publication; it is not an opinion on the merits of the case. Any summary may be incomplete, out of date, or wrong. The authoritative source is the court record. Investigations are editorial descriptions of matters we are evaluating; no lawsuit has been filed in an investigation unless the page says so.</P>

      <H2>3. Intake submissions</H2>
      <P>When you submit a form, you are asking us to evaluate whether you may have a claim. You agree that the information you provide is accurate to the best of your knowledge, that you are at least 18, and that you are submitting it on your own behalf or with authority to do so. We may review your submission ourselves or share it with co-counsel or another firm as described in our <Link href="/privacy">privacy policy</Link>. We are under no obligation to accept any matter, and we may decline for any reason. Do not send confidential or time-sensitive information until representation has been confirmed in writing; statutes of limitation can bar claims, and a form submission does not stop the clock.</P>

      <H2>4. Intellectual property</H2>
      <P>Court filings are public records. Our summaries, images, page layouts, and other original content are owned by {OWNER.firm} and protected by copyright. You may link to any page and quote short excerpts with attribution. You may not copy, republish, or redistribute the Site&apos;s content in bulk, or use automated tools to scrape it, without written permission.</P>

      <H2>5. Acceptable use</H2>
      <P>You agree not to use the Site to submit false or misleading information, to impersonate another person, to interfere with the Site&apos;s operation, to attempt unauthorized access to any system or data, or for any unlawful purpose.</P>

      <H2>6. Third-party sites</H2>
      <P>The Site links to CourtListener and other third-party sites. We do not control them and are not responsible for their content or practices.</P>

      <H2>7. Disclaimer of warranties</H2>
      <P>The Site and its content are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind, express or implied, including accuracy, completeness, timeliness, fitness for a particular purpose, and non-infringement. We do not warrant that the Site will be uninterrupted or error-free.</P>

      <H2>8. Limitation of liability</H2>
      <P>To the fullest extent permitted by law, {OWNER.firm} and its attorneys and staff will not be liable for any indirect, incidental, consequential, or punitive damages, or for any loss of data or profits, arising out of your use of or inability to use the Site, even if advised of the possibility. Nothing in these terms limits liability that cannot be limited under applicable law or under rules governing lawyers.</P>

      <H2>9. Corrections and removal</H2>
      <P>If you believe a listing is inaccurate or that you have been wrongly identified, see our <Link href="/contact">contact page</Link>. We review every request and will correct or remove entries where warranted.</P>

      <H2>10. Governing law</H2>
      <P>These terms are governed by the laws of the State of Florida, without regard to conflict-of-law rules. Any dispute arising from the Site will be brought in the state or federal courts located in Palm Beach County, Florida, and you consent to their jurisdiction.</P>

      <H2>11. Changes</H2>
      <P>We may revise these terms at any time by posting an updated version with a new effective date. Continued use of the Site after a change means you accept the revised terms.</P>

      <H2>12. Contact</H2>
      <P>
        {OWNER.firm} · {OWNER.name}, Florida Bar No. {OWNER.barFlorida}<br />
        {OWNER_ADDRESS_LINE}<br />
        <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> · <a href={`tel:${OWNER.phoneE164}`}>{OWNER.phoneDisplay}</a>
      </P>
    </div>
  );
}
