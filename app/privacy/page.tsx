import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL, OWNER, OWNER_ADDRESS_LINE } from '../lib/site';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${SITE_NAME} (published by ${OWNER.firm}) collects, uses, shares, and protects information, including intake-form submissions.`,
  alternates: { canonical: '/privacy' },
};

const EFFECTIVE_DATE = 'October 30, 2026';

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 6 }}>{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ color: 'var(--ink-soft)', maxWidth: 720, marginTop: 10, lineHeight: 1.6 }}>{children}</p>
);
const UL = ({ children }: { children: React.ReactNode }) => (
  <ul style={{ color: 'var(--ink-soft)', maxWidth: 720, marginTop: 8, paddingLeft: 22, lineHeight: 1.6 }}>{children}</ul>
);

export default function Privacy() {
  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/">Home</Link> › Privacy policy</div>
      <h1 style={{ marginBottom: 4 }}>Privacy policy</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Effective {EFFECTIVE_DATE}</p>

      <P>
        This policy explains what information {SITE_NAME} (the &ldquo;Site,&rdquo; at {SITE_URL}) collects, how it is used, and the choices you have. The Site is published by {OWNER.firm} (&ldquo;we,&rdquo; &ldquo;us&rdquo;), {OWNER_ADDRESS_LINE}. The attorney responsible for the Site is {OWNER.name}. Questions about this policy can be sent to <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
      </P>

      <H2>1. What we collect</H2>
      <P><strong>Information you give us.</strong> If you submit an intake form on a case or investigation page, we collect what you enter: typically your name, email address, phone number, state of residence, and a description of your experience with the product or company. Submitting a form is voluntary.</P>
      <P><strong>Information collected automatically.</strong> Like most websites, our hosting provider records standard server logs when you visit: your IP address, browser type, the pages you request, the referring page, and timestamps. We use these only to operate and secure the Site and to understand aggregate traffic. We do not use advertising cookies, do not run third-party ad networks, and do not build advertising profiles of visitors.</P>
      <P><strong>Information we do not collect.</strong> We do not ask for, and you should not send, Social Security numbers, financial account numbers, government ID numbers, or medical records through the Site.</P>

      <H2>2. How we use it</H2>
      <UL>
        <li>To evaluate whether you may have a claim in a case or investigation listed on the Site, and to contact you about it.</li>
        <li>If you leave the newsletter box checked on a form, to send you a monthly email about new investigations. Every issue has an unsubscribe link, and unsubscribing does not affect your submission.</li>
        <li>To respond to correction, removal, and other inquiries.</li>
        <li>To operate, secure, troubleshoot, and improve the Site.</li>
        <li>To comply with legal and professional-responsibility obligations.</li>
      </UL>
      <P>We do not sell your personal information, and we do not share it with third parties for their own marketing.</P>

      <H2>3. Who we share it with</H2>
      <P><strong>Co-counsel and referral firms.</strong> Depending on the subject matter and the state where you live, we may share your intake submission with another law firm that is handling, or evaluating, the matter you wrote about. We share only what is needed to evaluate your potential claim. Those firms are bound by their own professional obligations of confidentiality.</P>
      <P><strong>Service providers.</strong> We use Vercel (hosting and serverless functions), Neon (database hosting), and Resend (email delivery, for confirmation emails and the monthly newsletter) to run the Site. They process data on our behalf under their own privacy and security commitments. Intake submissions are stored in our database; they are not sent to AI providers. (The case summaries on the Site are generated from public court records only.)</P>
      <P><strong>Legal requirements.</strong> We may disclose information if required by law, subpoena, or court order, or to protect our rights, your safety, or the safety of others.</P>

      <H2>4. Attorney-client relationship and confidentiality</H2>
      <P>Submitting a form or contacting us does <strong>not</strong> create an attorney-client relationship. Until a lawyer has agreed in writing to represent you, information you send may not be protected by the attorney-client privilege. We treat intake submissions as confidential as a matter of practice, but you should not send sensitive or time-critical information before representation is confirmed.</P>

      <H2>5. How long we keep it</H2>
      <P>We keep intake submissions for as long as reasonably necessary to evaluate the potential claim and, if we or a co-counsel firm take on the matter, for as long as professional rules require. Submissions that do not lead to representation are deleted or anonymized within 24 months unless you ask us to keep or delete them sooner. If you subscribed to the monthly email, we keep your email address on that list until you unsubscribe. Server logs are retained by our hosting provider on a rolling basis, typically no longer than 30 days.</P>

      <H2>6. Your choices and rights</H2>
      <P>You can ask us at any time to see, correct, or delete the personal information we hold about you, or to stop contacting you. Email <a href={`mailto:${OWNER.email}?subject=Privacy%20request`}>{OWNER.email}</a> with your request; we will respond within 30 days and may ask you to verify your identity first.</P>
      <P>If you are a California resident, the California Consumer Privacy Act gives you the rights to know, delete, and correct your personal information, and to opt out of its sale or sharing. We do not sell or share personal information as those terms are defined under the CCPA. Residents of other states with comprehensive privacy laws may have similar rights; the same email address works for all requests, and we will not discriminate against you for exercising them.</P>

      <H2>7. Security</H2>
      <P>The Site is served over HTTPS. Intake submissions are stored in an access-controlled database. No system is perfectly secure, and we cannot guarantee that unauthorized access will never occur, but we take reasonable measures to protect the information we hold.</P>

      <H2>8. Children</H2>
      <P>The Site is not directed to children under 18 and we do not knowingly collect information from them. If you believe a minor has submitted information, email us and we will delete it.</P>

      <H2>9. Links to other sites</H2>
      <P>Case pages link to CourtListener and other third-party sites. Their privacy practices are their own; this policy does not cover them.</P>

      <H2>10. Changes</H2>
      <P>We may update this policy from time to time. The effective date at the top will change when we do, and material changes will be noted on this page.</P>

      <H2>11. Contact</H2>
      <P>
        {OWNER.firm}<br />
        Attn: {OWNER.name}<br />
        {OWNER_ADDRESS_LINE}<br />
        <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> · <a href={`tel:${OWNER.phoneE164}`}>{OWNER.phoneDisplay}</a>
      </P>
    </div>
  );
}
