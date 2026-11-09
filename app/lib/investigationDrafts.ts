import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { sendEmail, esc } from './email';
import { SITE_URL, SITE_NAME, OWNER } from './site';

// Shared plumbing for machine-proposed investigations. Everything created here
// lands as status = 'draft', invisible to the public until approved in /admin.

const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const INVESTIGATION_CATEGORIES = [
  'Health & safety', 'Mislabeling', 'Hidden fees', 'Privacy & data', 'Product defect', 'False advertising', 'Other',
] as const;

export type DraftFields = {
  title: string;        // question form: "Did you … ?"
  defendant: string;    // company / products under investigation
  category: string;     // one of INVESTIGATION_CATEGORIES
  allegation: string;
  affected: string;
  why_matters: string;
};

export type Evidence = {
  kind: 'filing' | 'page' | 'note';
  label: string;
  url?: string;
  date?: string;
  detail?: string;
};

export async function wasSeen(source: string, ref: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM external_seen WHERE source = ${source} AND ref = ${ref} LIMIT 1`;
  return r.length > 0;
}

export async function markSeen(source: string, ref: string, note?: string): Promise<void> {
  await sql`
    INSERT INTO external_seen (source, ref, note) VALUES (${source}, ${ref}, ${note ?? null})
    ON CONFLICT (source, ref) DO NOTHING
  `;
}

export async function seenCount(source: string): Promise<number> {
  const r = await sql`SELECT COUNT(*)::int AS n FROM external_seen WHERE source = ${source}`;
  return r[0]?.n ?? 0;
}

/** True if an investigation from this source/ref already exists (any status) within `days`. */
export async function draftExists(source: string, ref: string, days = 45): Promise<boolean> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];
  const r = await sql`
    SELECT 1 FROM investigations
    WHERE source = ${source} AND source_ref = ${ref} AND opened_date >= ${since}::date
    LIMIT 1
  `;
  return r.length > 0;
}

export async function createDraft(
  fields: DraftFields,
  meta: { source: string; sourceRef: string; sourceUrl?: string; evidence: Evidence[] },
): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const category = (INVESTIGATION_CATEGORIES as readonly string[]).includes(fields.category) ? fields.category : 'Other';
  const rows = await sql`
    INSERT INTO investigations (
      title, defendant, category, allegation, affected, why_matters,
      opened_date, updated_date, status, source, source_ref, source_url, evidence
    ) VALUES (
      ${fields.title.slice(0, 200)}, ${fields.defendant.slice(0, 300)}, ${category},
      ${fields.allegation}, ${fields.affected}, ${fields.why_matters},
      ${today}, ${today}, 'draft', ${meta.source}, ${meta.sourceRef}, ${meta.sourceUrl ?? null},
      ${JSON.stringify(meta.evidence)}::jsonb
    )
    RETURNING id
  `;
  return rows[0].id as number;
}

export async function notifyDraft(id: number, fields: DraftFields, meta: { source: string; sourceUrl?: string; evidence: Evidence[] }): Promise<boolean> {
  const to = process.env.LEADS_TO_EMAIL || OWNER.email;
  const adminUrl = `${SITE_URL}/admin`;
  const sourceLabel = meta.source === 'milberg' ? 'Milberg filing trend' : meta.source === 'classaction.org' ? 'New on ClassAction.org' : meta.source;

  const evidenceText = meta.evidence
    .map((e) => `• ${e.label}${e.date ? ` (${e.date})` : ''}${e.url ? `: ${e.url}` : ''}${e.detail ? `\n    ${e.detail}` : ''}`)
    .join('\n');
  const evidenceHtml = meta.evidence
    .map((e) => `<li>${e.url ? `<a href="${esc(e.url)}">${esc(e.label)}</a>` : esc(e.label)}${e.date ? ` <span style="color:#666">(${esc(e.date)})</span>` : ''}${e.detail ? `<div style="color:#444;font-size:13px;margin-top:2px">${esc(e.detail)}</div>` : ''}</li>`)
    .join('');

  const section = (h: string, b: string) => `<h3 style="margin:18px 0 4px;font-size:14px;color:#333">${esc(h)}</h3><p style="margin:0;white-space:pre-wrap">${esc(b)}</p>`;

  return sendEmail({
    to,
    subject: `Draft investigation to review: ${fields.title}`,
    text:
      `A new investigation draft is waiting for your review on ${SITE_NAME}.\n` +
      `Source: ${sourceLabel}${meta.sourceUrl ? `: ${meta.sourceUrl}` : ''}\n\n` +
      `TITLE\n${fields.title}\n\nDEFENDANT / PRODUCTS\n${fields.defendant}\n\nCATEGORY\n${fields.category}\n\n` +
      `THE ALLEGATION\n${fields.allegation}\n\nWHO MAY BE AFFECTED\n${fields.affected}\n\nWHY THIS MATTERS\n${fields.why_matters}\n\n` +
      `EVIDENCE\n${evidenceText}\n\n` +
      `Approve, edit, or discard here: ${adminUrl}\n\nNothing is public until you approve it.`,
    html:
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:680px">` +
      `<p style="margin:0 0 6px;color:#666;font-size:13px">${esc(sourceLabel)}${meta.sourceUrl ? ` · <a href="${esc(meta.sourceUrl)}">source</a>` : ''}</p>` +
      `<h2 style="margin:0 0 4px;font-size:19px">${esc(fields.title)}</h2>` +
      `<p style="margin:0;color:#444"><strong>Under investigation:</strong> ${esc(fields.defendant)} · <strong>Category:</strong> ${esc(fields.category)}</p>` +
      section('The allegation', fields.allegation) +
      section('Who may be affected', fields.affected) +
      section('Why this matters', fields.why_matters) +
      `<h3 style="margin:18px 0 4px;font-size:14px;color:#333">Evidence</h3><ul style="margin:0;padding-left:18px">${evidenceHtml}</ul>` +
      `<p style="margin:24px 0 0"><a href="${esc(adminUrl)}" style="background:#1f3a5f;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;font-weight:600">Review in admin</a></p>` +
      `<p style="margin-top:14px;color:#666;font-size:13px">Draft #${id}. Nothing is public until you approve it.</p>` +
      `</div>`,
  });
}

/** Ask Claude for JSON and parse it defensively. */
export async function draftWithClaude(prompt: string, maxTokens = 1200): Promise<any> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const DRAFT_STYLE_RULES = `
Writing rules (these appear on a law-firm website and are attorney advertising):
- Neutral, factual, plain English. Say "attorneys are investigating whether…", never assert that a company did something wrong.
- A complaint contains allegations, not findings. Use "alleges," "claims," "according to the complaint."
- No legal advice, no promises of compensation, no urgency language ("act now").
- Do not name plaintiffs' law firms or individual plaintiffs.
- Do not copy sentences from any source; write original text.
- Title must be a question addressed to the reader, under 110 characters, e.g. "Did you receive debt-collection letters from X after disputing the debt?"
- "defendant" is the company, product line, or practice under investigation; generic if no single company.
- "category" must be exactly one of: ${INVESTIGATION_CATEGORIES.join(' | ')}.
- allegation: 2 to 4 sentences. affected: 2 to 3 sentences describing who might qualify. why_matters: 2 to 4 sentences grounded in the facts provided (filings, recalls, studies, regulatory actions).
- Never use em-dashes or en-dashes in any field.
`;
