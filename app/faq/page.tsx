import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '../components/JsonLd';
import { SITE_NAME, SITE_URL, OWNER } from '../lib/site';

export const metadata: Metadata = {
  title: 'FAQ: how class actions work',
  description: 'Plain-English answers: what a class action is, how to tell if you qualify, whether it costs anything, what happens after you submit a form, how long cases take, and where our data comes from.',
  alternates: { canonical: '/faq' },
};

// Keep questions and answers in one place so the visible page and the
// FAQPage structured data can never drift apart.
const FAQS: { q: string; a: React.ReactNode; plain: string }[] = [
  {
    q: 'What is a class action?',
    plain: 'A class action is a lawsuit in which one or a few named plaintiffs sue on behalf of a larger group of people (the "class") who were harmed in the same way by the same conduct. It lets many small, similar claims be resolved together when it would be impractical for each person to sue individually.',
    a: <>A class action is a lawsuit in which one or a few named plaintiffs sue on behalf of a larger group of people (the &ldquo;class&rdquo;) who were harmed in the same way by the same conduct. It lets many small, similar claims (a mislabeled product, an unauthorized fee, a data breach) be resolved together when it would be impractical for each person to sue individually.</>,
  },
  {
    q: 'How do I know if I am part of a class?',
    plain: 'You are a potential class member if you fit the class definition in the complaint: for example, everyone who bought a specific product in a specific period. Nothing is final until the court certifies the class and defines it. The case summary on each page describes the proposed class; the full complaint on CourtListener has the exact definition.',
    a: <>You are a potential class member if you fit the class definition in the complaint: for example, &ldquo;everyone who bought Product X in the United States between 2022 and 2026.&rdquo; Nothing is final until the court certifies the class and defines it. Each case page summarizes the proposed class; the full complaint (linked on every case page) has the exact wording.</>,
  },
  {
    q: 'Does it cost anything to contact you or to join a class action?',
    plain: 'No. Reading this site and submitting a form are free. Consumer class actions are almost always handled on a contingency basis, meaning lawyers are paid from any settlement or judgment, subject to court approval, and class members do not pay out of pocket.',
    a: <>No. Reading this site and submitting a form are free. Consumer class actions are almost always handled on a contingency basis: the lawyers are paid out of any settlement or judgment, in an amount the court must approve, and class members do not pay out of pocket.</>,
  },
  {
    q: 'What happens after I submit a form?',
    plain: `Your submission goes to ${OWNER.firm}. An attorney reviews it and, if it looks like we may be able to help, may contact you by email or phone within 30 days. We receive more messages than we can answer individually, so you may not hear from us at all; if 30 days pass without a reply, assume we are not able to take your matter. Depending on the matter and your state, we may refer you to co-counsel. Submitting a form does not make you a client; that only happens if you sign a written engagement agreement.`,
    a: <>Your submission goes to {OWNER.firm}. An attorney reviews it and, if it looks like we may be able to help, may contact you by email or phone within 30 days. We receive more messages than we can answer individually, so you may not hear from us at all; if 30 days pass without a reply, assume we are not able to take your matter. Depending on the matter and your state, we may refer you to co-counsel. Submitting a form does <strong>not</strong> make you a client; that only happens if you sign a written engagement agreement. See our <Link href="/privacy">privacy policy</Link> for how your information is handled.</>,
  },
  {
    q: 'How long does a class action take?',
    plain: 'Usually years. After a complaint is filed, the defendant responds, the parties exchange evidence, and the court decides whether to certify the class, often 12 to 24 months in. Settlement or trial can take longer. If the case settles, class members are notified and given a way to claim their share.',
    a: <>Usually years. After a complaint is filed, the defendant responds, the parties exchange evidence (&ldquo;discovery&rdquo;), and the court decides whether to certify the class, often 12 to 24 months in. Settlement or trial can take longer still. If the case settles, class members are notified by mail, email, or public notice and given a way to claim their share.</>,
  },
  {
    q: 'Do I need to do anything to be included?',
    plain: 'In most consumer class actions for money damages, you are automatically included if you fit the class definition, and you will be notified if there is a settlement. You usually must file a claim form to receive payment. You can also opt out to preserve your right to sue individually.',
    a: <>In most consumer class actions seeking money, you are automatically included if you fit the class definition, and you will be notified if there is a settlement. You usually must then file a short claim form to receive payment. You can also opt out if you would rather keep the right to sue on your own.</>,
  },
  {
    q: 'Where does the information on this site come from?',
    plain: 'From CourtListener (a free public-records database maintained by the non-profit Free Law Project, which mirrors the federal courts’ PACER system), from state court filings, and from other public sources. Every morning our software looks for newly filed consumer class actions and, when the complaint can be read, generates a plain-English summary with AI. Some cases are added by an attorney. Each case page names its source.',
    a: <>From CourtListener (a free public-records database maintained by the non-profit Free Law Project, which mirrors the federal courts&apos; PACER system), from state court filings, and from other public sources. Every morning our software looks for newly filed consumer class actions and, when the complaint can be read, generates a plain-English summary using an AI language model. Some cases are added by an attorney at {OWNER.firm}. Each case page names its source.</>,
  },
  {
    q: 'Are the summaries reviewed by a lawyer?',
    plain: 'Some are. A case marked with a star has a summary that an attorney reviewed before publication. The star is about the accuracy of the summary; it is not an opinion on the merits of the case. All other summaries are generated automatically, are not reviewed by an attorney, and can contain errors. The court record is the authoritative source. Investigations are written and curated by attorneys.',
    a: <>Some are. A case marked with a star (<span style={{ color: 'var(--accent)' }} aria-hidden="true">★</span>) has a summary that an attorney at {OWNER.firm} reviewed before publication. The star is about the accuracy of the summary; it is not an opinion on the merits of the case. All other summaries are generated automatically, are not reviewed by an attorney, and can contain errors: a mis-named defendant, a mischaracterized claim. The court record is the authoritative source. <strong>Investigations</strong> are written and curated by attorneys at {OWNER.firm}. See <Link href="/about#accuracy">accuracy and limitations</Link>.</>,
  },
  {
    q: 'A company I am involved with is listed here. Does that mean it did something wrong?',
    plain: 'No. A listing means only that a complaint naming the company was filed. A complaint contains unproven allegations; many are dismissed, settled without admission, or never certified. If you believe a listing is inaccurate, contact us and we will review it.',
    a: <>No. A listing means only that a complaint naming the company was filed in court. A complaint contains unproven allegations; many class actions are dismissed, settled without any admission of wrongdoing, or never certified. If you believe a listing is inaccurate, <Link href="/contact">contact us</Link> and we will review it.</>,
  },
  {
    q: 'Who runs this site?',
    plain: `${SITE_NAME} is published by ${OWNER.firm}, a law firm in Boca Raton, Florida. The responsible attorney is ${OWNER.name}, Florida Bar No. ${OWNER.barFlorida}.`,
    a: <>{SITE_NAME} is published by {OWNER.firm}, a law firm in Boca Raton, Florida. The responsible attorney is {OWNER.name}, Florida Bar No. {OWNER.barFlorida}. Full details, address, and bar admissions are on the <Link href="/about">about</Link> and <Link href="/contact">contact</Link> pages.</>,
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/faq`,
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.plain },
  })),
};

export default function FAQ() {
  return (
    <div className="single-col">
      <JsonLd data={faqSchema} />
      <div className="breadcrumb"><Link href="/">Home</Link> › FAQ</div>
      <h1 style={{ marginBottom: 8 }}>Frequently asked questions</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginBottom: 8 }}>
        How class actions work, what it means to be a class member, and how this site operates. This is general information, not legal advice about your situation.
      </p>

      <nav aria-label="Questions" style={{ fontSize: 14, maxWidth: 680, margin: '16px 0 28px', padding: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          {FAQS.map((f, i) => (
            <li key={i}><a href={`#q${i + 1}`}>{f.q}</a></li>
          ))}
        </ol>
      </nav>

      {FAQS.map((f, i) => (
        <section key={i} id={`q${i + 1}`} style={{ maxWidth: 720, marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>{f.q}</h2>
          <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>{f.a}</p>
        </section>
      ))}

      <p style={{ fontSize: 13, color: 'var(--ink-muted)', maxWidth: 720, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        Attorney advertising. Nothing on this page creates an attorney-client relationship. Statutes of limitation can bar claims; if you think you have been harmed, do not wait to seek advice.
      </p>
    </div>
  );
}
