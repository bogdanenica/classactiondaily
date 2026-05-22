import Link from 'next/link';

export default function About() {
  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/">Home</Link> › About</div>
      <h1 style={{ marginBottom: 8 }}>About ClassActionDaily</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        ClassActionDaily aggregates newly filed consumer class action complaints from U.S. federal district courts and publishes plain-English summaries within 24 hours of filing.
      </p>
      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>How it works</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        The site has two distinct sections. <strong>Latest Cases</strong> are filed complaints pulled automatically each morning from CourtListener — a free public-records database maintained by the Free Law Project — for putative class actions in consumer protection categories. We extract the docket information, retrieve the complaint, and generate a readable summary using AI. Cases are published automatically without editorial review.
      </p>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680, marginTop: 12 }}>
        <strong>Investigations</strong> are different: they are editorially curated, pre-litigation inquiries where attorneys are evaluating whether a class action can be brought. No suit has been filed. Investigations appear and update only when our editorial team launches a new one. Submissions help determine whether a case is viable.
      </p>
      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>Source of data</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        All case information is sourced from CourtListener (courtlistener.com) and the federal courts&apos; PACER system.
      </p>
      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>Lead-gen relationships</h2>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 680 }}>
        For each case, intake form submissions are routed to one or more participating plaintiffs&apos; firms with active practices in the relevant category. ClassActionDaily is not a law firm and does not provide legal advice. The forwarding of an inquiry does not create an attorney-client relationship.
      </p>
    </div>
  );
}