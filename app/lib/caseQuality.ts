import Anthropic from '@anthropic-ai/sdk';

// Quality rules for case pages.
//
//  1. A summary may only state what a source states. No guessing from a name.
//  2. Sources, best first: the complaint itself; then the docket's cause of
//     action and nature of suit. With neither, the case is held, not published.
//  3. Only consumer class actions are published. Wage-and-hour, securities,
//     civil rights, IP, and business-against-business cases are held.

const MODEL = 'claude-sonnet-4-6';
let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

export const CATEGORY_LIST =
  'Food & beverage | Consumer electronics | Subscription services | Personal care | Automotive | Retail | Apparel | Financial products | Home appliances | Other';
export const ALLEGATION_LIST =
  'False advertising | Mislabeling | Auto-renewal | Product defect | Pricing | Privacy | Other';

// ---------------------------------------------------------------------------
// Docket facts: cause of action and nature of suit
// ---------------------------------------------------------------------------

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** True when the docket gives us something real to describe the case with. */
export function hasDocketInfo(cause: unknown, nos: unknown): boolean {
  const c = clean(cause), n = clean(nos);
  const empty = (v: string) => !v || /^(n\/?a|none|unknown|not specified|other)$/i.test(v);
  return !empty(c) || !empty(n);
}

// Nature-of-suit and cause-of-action patterns for cases that are not consumer cases.
const NOS_NON_CONSUMER =
  /\b(labor|fair labor|erisa|employee retirement|employment|family and medical|railway labor|civil rights|prisoner|habeas|securities|commodities|patent|trademark|copyright|bankruptcy|social security|tax(es)?\b|immigration|naturalization|forfeiture|foreclosure|real property|land condemnation|rent lease|torts? to land|americans with disabilities|education|voting|housing\/accommodations|student loans?|medicare|veteran|admiralty|marine|miller act|negotiable instrument|recovery of (overpayment|defaulted))/i;
const CAUSE_NON_CONSUMER =
  /^\s*(29:|42:\s?(1981|1983|1985|2000|12101|121\d\d|3601|405)|15:\s?78|15:\s?77|35:|17:|8:|26:|11:|33:|46:|45:)|fair labor standards|flsa|e\.?r\.?i\.?s\.?a|securities exchange|job discrimination|employment discrimination|civil rights|americans with disabilities|patent infringement|copyright|trademark infringement|denial of (overtime|benefits)|unpaid (wages|overtime)/i;

export type Screen = { consumer: boolean; reason: string };

/** Screen a case on docket facts alone. Unknown is treated as "could be". */
export function screenDocket(cause: unknown, nos: unknown): Screen {
  const c = clean(cause), n = clean(nos);
  if (n && NOS_NON_CONSUMER.test(n)) return { consumer: false, reason: `nature of suit: ${n}` };
  if (c && CAUSE_NON_CONSUMER.test(c)) return { consumer: false, reason: `cause of action: ${c}` };
  return { consumer: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Spotting older summaries that were guessed
// ---------------------------------------------------------------------------

// Phrases the old prompt produced when it had nothing to go on. Kept as a
// Postgres regex string too, so the cleanup job can filter in SQL.
export const HEDGE_SQL =
  '(appears? to (involve|be|concern|relate)|would likely|likely (consist|include|involve)|potentially involving|have not (yet )?been (detailed|specified|disclosed)|not (yet )?(been )?(detailed|available|specified) in|details? (of the complaint )?(are|is|remain) (limited|unclear|not yet available|unavailable)|remain(s)? unclear|would require review|precise allegations|more information becomes available|complaint details are not|specific (details|allegations|cause of action)[^.]{0,60}(limited|not|unclear|unavailable))';
export const HEDGE_RE = new RegExp(HEDGE_SQL, 'i');

// A wider net for the second cleanup pass. Older summaries were written from
// the case name and docket codes alone, and fill the gaps with phrases like
// these. Only applied to summaries that did not come from a complaint.
export const HEDGE_WIDE_RE = new RegExp(
  HEDGE_SQL + '|' +
  '(likely (related|relating|by|centers?|to|includes?|involv\\w+|stems?|school)|typically involve|(is|are) expected to include|(may|could|might) (include|relate|involve|have)|one or more of its|potentially (including|through|numbering)|not fully outlined|suggesting (the|that)|has not yet been formally|(a |the )?(specified|defined|specific|relevant) (time )?period|or other (deceptive|product characteristics)|such as [^.]{0,80}, or (other|similar))',
  'i');

export function looksGuessedWide(summary: unknown): boolean {
  return HEDGE_WIDE_RE.test(String(summary ?? ''));
}

export function looksGuessed(summary: unknown): boolean {
  return HEDGE_RE.test(String(summary ?? ''));
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export type CaseSummary = {
  consumer: boolean;        // is this a consumer class action?
  reason: string;           // one line, for the admin log
  defendant: string;
  category: string;
  allegation_type: string;
  summary: string;
};

function parseJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

const STYLE_RULES = `Writing rules:
- Plain English. No legal jargon. No quotations.
- Describe allegations as allegations ("the complaint alleges", "plaintiffs claim"), never as established fact.
- Never use em-dashes or en-dashes.
- "defendant": the company being sued, as a clean name without LLC/Inc unless ambiguous.
- "category" must be exactly one of: ${CATEGORY_LIST}
- "allegation_type" must be exactly one of: ${ALLEGATION_LIST}`;

/**
 * Summary from docket facts only (no complaint available). The model is told
 * what it knows and forbidden from adding anything else, so the result is
 * short and may be thin. That is intended.
 */
export async function summarizeFromDocket(input: { caseName: string; court: string; dateFiled: string; cause: string; nos: string }): Promise<CaseSummary> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are writing a short, strictly factual note about a newly filed federal lawsuit. The complaint is NOT available to you. You know only these docket facts:

Case name: ${input.caseName}
Court: ${input.court}
Date filed: ${input.dateFiled}
Cause of action (as coded on the docket): ${input.cause || '(blank)'}
Nature of suit (as coded on the docket): ${input.nos || '(blank)'}

Hard rules:
- State ONLY what follows from the facts above. You may explain in one plain sentence what the cited statute or nature-of-suit code generally covers.
- Do NOT infer anything from the names of the parties. A company called "Food Corp" tells you nothing about the claims.
- Do NOT describe products, conduct, harm, or who is in the class. You do not know them.
- Do NOT use the words "appears", "likely", "potentially", "may involve", "presumably", or similar.
- Say plainly that the complaint has not been reviewed and that this note reflects the docket's coding only.
- 2 to 4 sentences, 40 to 80 words.
- "consumer": false if the cause or nature of suit shows an employment, wage, securities, civil rights, intellectual property, or business-against-business dispute; otherwise true.

${STYLE_RULES}

Respond ONLY with valid JSON:
{"consumer": true, "reason": "one short line", "defendant": "", "category": "", "allegation_type": "", "summary": ""}`,
    }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  return parseJson(text) as CaseSummary;
}

function complaintInstructions(caseName: string, court: string): string {
  return `Summarize the complaint filed in ${court || 'court'}, captioned "${caseName}", for a consumer-news site that lists consumer class actions.

First decide: is this a CONSUMER class action? That means a proposed class of people who bought, used, subscribed to, were charged for, were contacted by, or had their personal data handled by a company's product or service (false advertising, mislabeling, defects, hidden fees, auto-renewal, privacy and data breach, robocalls and texts, debt collection, credit reporting, and similar).
It is NOT a consumer class action if it is: a wage, overtime, or other employment case (including FLSA collective actions); a securities or shareholder case; a civil rights or disability-access case; an ERISA or benefits case; an intellectual property case; a dispute between businesses; an individual (non-class) case; or a case against a government body.

Then write the summary:
- One paragraph, 110 to 160 words.
- Say who is suing whom, what the complaint alleges the defendant did, what product or service is involved, and who is in the proposed class (including any time period or state the complaint gives).
- Use only what the complaint says. If the complaint does not say something, leave it out. Do not speculate.
- If it is not a consumer class action, still write an accurate summary of what it is.

${STYLE_RULES}

Respond ONLY with valid JSON:
{"consumer": true, "reason": "one short line saying why it is or is not a consumer class action", "defendant": "", "category": "", "allegation_type": "", "summary": ""}`;
}

/** Summary from the complaint text itself. */
export async function summarizeFromComplaint(input: { caseName: string; court: string; complaint: string }): Promise<CaseSummary> {
  // Front matter, the nature of the action, parties, facts, and class definition
  // are in the opening pages. Send a generous slice of the start plus the end
  // (prayer for relief), and skip the repetitive counts in the middle.
  const t = input.complaint.replace(/\u0000/g, '').trim();
  const body = t.length <= 60_000 ? t : `${t.slice(0, 48_000)}\n\n[... middle of the complaint omitted ...]\n\n${t.slice(-8_000)}`;

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `${complaintInstructions(input.caseName, input.court)}\n\nCOMPLAINT TEXT:\n${body}`,
    }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  return parseJson(text) as CaseSummary;
}

/** Summary from a complaint PDF (used when an attorney adds a case by hand). Reads scanned PDFs too. */
export async function summarizeFromPdf(input: { caseName: string; court: string; pdfBase64: string }): Promise<CaseSummary> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } },
        { type: 'text', text: `The attached PDF is the complaint. ${complaintInstructions(input.caseName, input.court)}` },
      ],
    }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  const text = block && block.type === 'text' ? block.text : '';
  return parseJson(text) as CaseSummary;
}

/**
 * A fixed, no-AI note for a case where all we have is the docket's coding.
 * Used by the cleanup job to replace guessed summaries: nothing here can be
 * wrong, because it only repeats what the docket says.
 */
export function docketNote(input: { court: string; dateFiled: string; cause: string; nos: string }): string {
  const strip = (v: string) => clean(v).replace(/^\d{2,3}\s+/, '').replace(/^\d{1,2}:\w+(\([a-z0-9]+\))*\s+/i, '').replace(/[.\s]+$/, '');
  const nos = strip(input.nos);
  const cause = strip(input.cause);
  const when = input.dateFiled
    ? new Date(input.dateFiled + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const filed = `This lawsuit was filed${input.court ? ` in ${input.court}` : ''}${when ? ` on ${when}` : ''}.`;
  const coded = nos && cause && nos.toLowerCase() !== cause.toLowerCase()
    ? ` The court docket classifies it as "${nos}" and lists the cause of action as "${cause}".`
    : nos || cause
      ? ` The court docket classifies it as "${nos || cause}".`
      : '';
  return `${filed}${coded} The complaint has not yet been read, so the specific allegations and the proposed class are not described here. This note will be replaced with a summary once the complaint is available.`;
}

/** Light sanity checks on a model summary before it is published. */
export function summaryProblems(s: CaseSummary | null | undefined, source: 'docket' | 'complaint'): string | null {
  if (!s || typeof s.summary !== 'string') return 'no summary returned';
  const words = s.summary.trim().split(/\s+/).length;
  if (words < 20) return 'summary too short';
  if (source === 'docket' && looksGuessed(s.summary)) return 'summary contains guessing language';
  if (!s.defendant || !s.category) return 'missing defendant or category';
  return null;
}

/** Strip dashes the model may still produce. */
export function tidy(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
}
