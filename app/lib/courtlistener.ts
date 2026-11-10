// Paced, budgeted access to the CourtListener API.
//
// A free account allows 5 requests a minute, 50 an hour, and 125 a day, shared
// by every job on the site and by any research done under the same account.
// Each job creates a Budget with its own cap; clGet waits between calls and
// refuses to go over the cap.

export const CL = 'https://www.courtlistener.com/api/rest/v4';
const MIN_GAP_MS = 12_500;

export type Budget = { max: number; used: number; lastCall: number; throttled: number };
export const newBudget = (max: number): Budget => ({ max, used: 0, lastCall: 0, throttled: 0 });
export const budgetLeft = (b: Budget) => b.max - b.used;

export class OutOfBudget extends Error {}

export async function clGet(url: string, b: Budget): Promise<{ ok: boolean; status: number; data: any }> {
  if (b.used >= b.max) throw new OutOfBudget('request cap reached');
  const wait = b.lastCall + MIN_GAP_MS - Date.now();
  if (b.used > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait));
  b.lastCall = Date.now();
  b.used++;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${process.env.COURTLISTENER_TOKEN}` },
    cache: 'no-store',
  });
  if (res.status === 429) b.throttled++;
  const data = res.ok ? await res.json().catch(() => null) : null;
  return { ok: res.ok, status: res.status, data };
}

export type DocketMeta = { cause: string; nos: string; terminated: string | null };

/** Cause of action and nature of suit for up to 20 dockets in one request. */
export async function fetchDocketMeta(ids: (string | number)[], b: Budget): Promise<Map<string, DocketMeta>> {
  const map = new Map<string, DocketMeta>();
  if (ids.length === 0) return map;
  const q = `docket_id:(${ids.join(' OR ')})`;
  const r = await clGet(`${CL}/search/?type=d&q=${encodeURIComponent(q)}`, b);
  if (!r.ok) throw new Error(`docket lookup ${r.status}`);
  for (const d of r.data?.results ?? []) {
    if (d?.docket_id == null) continue;
    map.set(String(d.docket_id), {
      cause: String(d.cause ?? '').trim(),
      nos: String(d.suitNature ?? '').trim(),
      terminated: d.dateTerminated ?? null,
    });
  }
  return map;
}

export type ComplaintResult = { text: string | null; note: string };

const MIN_COMPLAINT_CHARS = 1500;

/**
 * Text of the complaint, if CourtListener has it. Looks at the first few
 * docket entries (the complaint, or a notice of removal with the state-court
 * complaint attached) and returns the longest document text found there.
 * Costs one request, or two when the text has to be fetched separately.
 */
export async function fetchComplaintText(docketId: string | number, b: Budget): Promise<ComplaintResult> {
  const r = await clGet(
    `${CL}/docket-entries/?docket=${docketId}&order_by=date_filed&page_size=4&fields=entry_number,date_filed,description,recap_documents`,
    b,
  );
  if (!r.ok) throw new Error(`docket entries ${r.status}`);
  const entries: any[] = r.data?.results ?? [];
  if (entries.length === 0) return { text: null, note: 'no docket entries on CourtListener' };

  type Doc = { id: number | null; text: string; available: boolean; label: string; rank: number };
  const docs: Doc[] = [];
  for (const e of entries) {
    const entryDesc = String(e?.description ?? '');
    for (const d of Array.isArray(e?.recap_documents) ? e.recap_documents : []) {
      const label = `${String(d?.description || d?.short_description || '')} ${entryDesc}`.trim();
      const isComplaint = /complaint|notice of removal|petition/i.test(label);
      const first = Number(e?.entry_number) === 1;
      if (!isComplaint && !first) continue;
      docs.push({
        id: d?.id ?? null,
        text: typeof d?.plain_text === 'string' ? d.plain_text : '',
        available: Boolean(d?.is_available),
        label: label.slice(0, 80),
        rank: (isComplaint ? 2 : 0) + (first ? 1 : 0),
      });
    }
  }
  if (docs.length === 0) return { text: null, note: 'no complaint document listed' };

  const withText = docs.filter((d) => d.text.length >= MIN_COMPLAINT_CHARS).sort((x, y) => y.text.length - x.text.length);
  if (withText.length > 0) return { text: withText[0].text, note: `complaint text from docket entry (${withText[0].text.length} chars)` };

  // The entry list may leave the text out. Ask for the best available document directly.
  const candidate = docs.filter((d) => d.available && d.id != null).sort((x, y) => y.rank - x.rank)[0];
  if (!candidate) return { text: null, note: 'complaint not yet in the RECAP archive' };
  const one = await clGet(`${CL}/recap-documents/${candidate.id}/?fields=plain_text,is_available,page_count`, b);
  if (!one.ok) return { text: null, note: `document fetch ${one.status}` };
  const text = typeof one.data?.plain_text === 'string' ? one.data.plain_text : '';
  if (text.length < MIN_COMPLAINT_CHARS) return { text: null, note: 'complaint is in the archive but has no readable text' };
  return { text, note: `complaint text from document ${candidate.id} (${text.length} chars)` };
}
