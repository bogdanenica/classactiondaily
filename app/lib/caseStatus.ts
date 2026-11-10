// Case status: what the docket shows about where a case stands.
//
// Cases are ingested once, at filing. A daily job in app/api/cron/status works
// through the open cases a few at a time and re-reads each docket on CourtListener and stores one
// of the statuses below. The case page shows a fixed sentence per status, so
// nothing a machine "wrote" about a case ever reaches the public page.
//
// The classifier is plain pattern matching on docket entry descriptions. It is
// deliberately conservative: when it cannot tell, it says so.

export type CaseStatus =
  | 'no_response'        // nothing from the defendant yet
  | 'answered'           // defendant filed an answer
  | 'mtd_pending'        // motion to dismiss filed, no ruling found
  | 'mtd_denied'         // motion to dismiss denied (in whole or part)
  | 'mtd_granted'        // motion to dismiss granted, case still open
  | 'arbitration'        // motion to compel arbitration filed or granted
  | 'class_certified'    // order granting class certification
  | 'settlement'         // settlement reported or approval pending
  | 'settled'            // settlement and case closed
  | 'dismissed'          // dismissed by the court and closed
  | 'dismissed_voluntary'// plaintiffs dropped the case
  | 'transferred'        // moved to another court (incl. MDL, remand)
  | 'closed'             // closed, reason not clear from the docket
  | 'unknown';           // docket data not available

export const FINAL_STATUSES: CaseStatus[] = ['settled', 'dismissed', 'dismissed_voluntary', 'transferred', 'closed'];

/** The one sentence shown on the case page. */
export const STATUS_SENTENCE: Record<CaseStatus, string> = {
  no_response: 'The defendant has not yet responded to the complaint.',
  answered: 'The defendant has answered the complaint, and the case is proceeding.',
  mtd_pending: 'The defendant has asked the court to dismiss the case. The court has not yet ruled.',
  mtd_denied: 'The court denied the defendant’s motion to dismiss, in whole or in part, and the case is proceeding.',
  mtd_granted: 'The court granted a motion to dismiss. The plaintiffs may have been given a chance to amend their complaint.',
  arbitration: 'The defendant has asked the court to send the dispute to arbitration.',
  class_certified: 'The court has certified a class in this case.',
  settlement: 'The parties have reported a settlement. Check the court docket for approval status and any claim deadline.',
  settled: 'This case was settled and is now closed.',
  dismissed: 'The court dismissed this case, and it is now closed.',
  dismissed_voluntary: 'The plaintiffs voluntarily dismissed this case, and it is now closed.',
  transferred: 'This case was transferred to another court and is closed in this one.',
  closed: 'This case has been closed.',
  unknown: 'We could not confirm the current status of this case from the public docket.',
};

/** Short label for the "Status" cell in the case header. */
export const STATUS_LABEL: Record<CaseStatus, string> = {
  no_response: 'Pending',
  answered: 'Pending',
  mtd_pending: 'Motion to dismiss pending',
  mtd_denied: 'Proceeding',
  mtd_granted: 'Motion to dismiss granted',
  arbitration: 'Arbitration requested',
  class_certified: 'Class certified',
  settlement: 'Settlement reported',
  settled: 'Settled',
  dismissed: 'Dismissed',
  dismissed_voluntary: 'Voluntarily dismissed',
  transferred: 'Transferred',
  closed: 'Closed',
  unknown: 'See docket',
};

export function asStatus(v: unknown): CaseStatus {
  return typeof v === 'string' && v in STATUS_SENTENCE ? (v as CaseStatus) : 'no_response';
}

export type DocketEntry = { date: string | null; text: string };

export type Classification = { status: CaseStatus; basis: string };

const RE = {
  answer: /(?<!\b(shall|to|must|may|will|should|not)\s)\banswer\b(?=\s*(to|by|and|with|of|filed|,|;|\.|$))/i,
  answerExclude: /\b(extension|extend|enlarge|time to (file )?(an )?answer|deadline|due|answer due|reply|response to (the )?answer|strike)\b/i,
  mtd: /\bmotion\b[^.]{0,80}\bto dismiss\b|\bmotion\b[^.]{0,40}\bjudgment on the pleadings\b/i,
  order: /\b(order|opinion|memorandum|minute entry|ruling|decision)\b/i,
  grant: /\bgrant(s|ed|ing)?\b/i,
  deny: /\bden(y|ies|ied|ying)\b/i,
  arbitration: /\bcompel\b[^.]{0,40}\barbitrat/i,
  classCert: /\b(class certification|certify(ing)? (a |the )?class|certif(y|ies|ied|ying)\b[^.]{0,40}\bclass)\b/i,
  settlement: /\b(notice of settlement|settlement (in principle|agreement|conference report|reached)|preliminary approval|final approval|class (action )?settlement|settled)\b/i,
  settlementExclude: /\b(settlement conference (set|scheduled|referr)|referr(ed|ing) .{0,40}settlement|mediat(ion|or) (set|scheduled|order))\b/i,
  voluntary: /\b(voluntar(y|ily) dismiss|notice of (voluntary )?dismissal|stipulat(ion|ed) (of|for|to) dismiss|41\(a\))/i,
  transfer: /\b(transferr(ed|ing)|order (of )?transfer|conditional transfer order|remand(ed|ing)? to|case transferred|MDL)\b/i,
  dismissedOrder: /\b(dismiss(ed|ing|al)|judgment)\b/i,
};

const NOT_ORDER = /\b(proposed order|memorandum (of law )?(in|of) (support|opposition)|(memorandum|brief|response|reply|opposition|declaration|notice)\b[^.]{0,30}\b(in support|in opposition|to|re)\b)/i;
function isOrder(t: string) {
  const head = t.slice(0, 160);
  return RE.order.test(head) && !NOT_ORDER.test(head.slice(0, 90));
}

/**
 * Decide a status from docket metadata plus entry descriptions.
 * `entries` can be in any order. `terminated` is the docket's date_terminated.
 */
export function classifyDocket(
  entries: DocketEntry[],
  opts: { terminated: string | null; filed: string | Date; now?: Date },
): Classification {
  const now = opts.now ?? new Date();
  const ageDays = Math.floor((now.getTime() - new Date(opts.filed).getTime()) / 86400000);
  const list = entries
    .filter((e) => e.text && e.text.trim())
    .map((e) => ({ date: e.date ?? '', text: e.text.replace(/\s+/g, ' ').trim() }))
    .sort((a, b) => a.date.localeCompare(b.date)); // oldest first

  const last = (pred: (t: string) => boolean) => {
    for (let i = list.length - 1; i >= 0; i--) if (pred(list[i].text)) return list[i];
    return null;
  };

  const settlement = last((t) => RE.settlement.test(t) && !RE.settlementExclude.test(t));
  const voluntary = last((t) => RE.voluntary.test(t));
  const transfer = last((t) => RE.transfer.test(t) && isOrder(t));
  const classCert = last((t) => isOrder(t) && RE.classCert.test(t) && RE.grant.test(t));
  const mtdFiled = last((t) => RE.mtd.test(t) && !isOrder(t));
  const mtdOrder = last((t) => isOrder(t) && RE.mtd.test(t) && (RE.grant.test(t) || RE.deny.test(t)));
  const arbitration = last((t) => RE.arbitration.test(t));
  const answer = last((t) => RE.answer.test(t.slice(0, 80)) && !RE.answerExclude.test(t.slice(0, 120)));

  if (opts.terminated) {
    if (settlement) return { status: 'settled', basis: `closed ${opts.terminated}; "${clip(settlement.text)}"` };
    if (voluntary) return { status: 'dismissed_voluntary', basis: `closed ${opts.terminated}; "${clip(voluntary.text)}"` };
    if (transfer) return { status: 'transferred', basis: `closed ${opts.terminated}; "${clip(transfer.text)}"` };
    const dism = last((t) => isOrder(t) && RE.dismissedOrder.test(t));
    if ((mtdOrder && RE.grant.test(mtdOrder.text)) || dism) {
      return { status: 'dismissed', basis: `closed ${opts.terminated}; "${clip((mtdOrder ?? dism)!.text)}"` };
    }
    return { status: 'closed', basis: `closed ${opts.terminated}; no clear reason in ${list.length} entries` };
  }

  if (settlement) return { status: 'settlement', basis: `"${clip(settlement.text)}"` };
  if (classCert) return { status: 'class_certified', basis: `"${clip(classCert.text)}"` };
  if (mtdOrder) {
    // "granted in part and denied in part" means the case goes on.
    const t = mtdOrder.text;
    const denied = RE.deny.test(t);
    // A newer motion after a grant means an amended complaint is being tested.
    if (!denied && mtdFiled && mtdFiled.date > mtdOrder.date) return { status: 'mtd_pending', basis: `"${clip(mtdFiled.text)}"` };
    return { status: denied ? 'mtd_denied' : 'mtd_granted', basis: `"${clip(t)}"` };
  }
  if (mtdFiled) return { status: 'mtd_pending', basis: `"${clip(mtdFiled.text)}"` };
  if (arbitration) return { status: 'arbitration', basis: `"${clip(arbitration.text)}"` };
  if (answer) return { status: 'answered', basis: `"${clip(answer.text)}"` };

  // Nothing from the defendant in what we could see. Only say "has not
  // responded" when we actually saw the docket, or the case is very new.
  if (list.length >= 2 || ageDays < 90) {
    return { status: 'no_response', basis: `${list.length} entries, none from the defendant` };
  }
  return { status: 'unknown', basis: `only ${list.length} docket entries available` };
}

function clip(s: string, n = 140) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
