import { neon } from '@neondatabase/serverless';

// Holding area for cases that are not published: either we know too little
// about them ('no_info') or they are not consumer class actions
// ('not_consumer'). A published page that gets removed is copied here in full
// first, so it can always be restored.

const sql = neon(process.env.DATABASE_URL!);

export type HoldReason = 'no_info' | 'not_consumer';

/** Is this docket already published or held? */
export async function alreadyKnown(courtlistenerId: string | number): Promise<boolean> {
  const id = String(courtlistenerId);
  const a = await sql`SELECT 1 FROM cases WHERE courtlistener_id::text = ${id} LIMIT 1`;
  if (a.length > 0) return true;
  const b = await sql`SELECT 1 FROM cases_held WHERE courtlistener_id = ${id} LIMIT 1`;
  return b.length > 0;
}

/** Hold a case that was never published. `facts` is whatever the docket told us. */
export async function holdNew(courtlistenerId: string | number, caseName: string, reason: HoldReason, detail: string, facts: Record<string, unknown>) {
  await sql`
    INSERT INTO cases_held (courtlistener_id, case_name, reason, detail, data)
    VALUES (${String(courtlistenerId)}, ${caseName}, ${reason}, ${detail.slice(0, 500)}, ${JSON.stringify(facts)}::jsonb)
    ON CONFLICT (courtlistener_id) DO UPDATE
      SET reason = EXCLUDED.reason, detail = EXCLUDED.detail
  `;
}

/**
 * Take a published case off the site. The full row is saved in cases_held.
 * Returns false (and changes nothing) if someone has submitted a form about
 * the case, because those submissions point at it.
 */
export async function unpublish(caseId: number, reason: HoldReason, detail: string): Promise<boolean> {
  const leads = await sql`SELECT 1 FROM leads WHERE case_id = ${caseId} LIMIT 1`;
  if (leads.length > 0) return false;
  await sql.transaction([
    sql`
      INSERT INTO cases_held (courtlistener_id, case_id, case_name, reason, detail, data)
      SELECT c.courtlistener_id::text, c.id, c.case_name, ${reason}, ${detail.slice(0, 500)}, to_jsonb(c)
      FROM cases c WHERE c.id = ${caseId}
      ON CONFLICT (courtlistener_id) DO UPDATE
        SET case_id = EXCLUDED.case_id, case_name = EXCLUDED.case_name, reason = EXCLUDED.reason,
            detail = EXCLUDED.detail, data = EXCLUDED.data, held_at = now()
    `,
    sql`DELETE FROM cases WHERE id = ${caseId}`,
  ]);
  return true;
}

/** Put a previously published case back, with its original id and URL. */
export async function restore(courtlistenerId: string): Promise<number | null> {
  const rows = await sql`SELECT case_id FROM cases_held WHERE courtlistener_id = ${courtlistenerId} AND case_id IS NOT NULL`;
  if (rows.length === 0) return null;
  const res = await sql.transaction([
    sql`
      INSERT INTO cases
      SELECT * FROM jsonb_populate_record(NULL::cases, (SELECT data FROM cases_held WHERE courtlistener_id = ${courtlistenerId}))
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    sql`DELETE FROM cases_held WHERE courtlistener_id = ${courtlistenerId}`,
  ]);
  return (res[0] as any[])[0]?.id ?? Number(rows[0].case_id);
}

export async function noteHeldAttempt(courtlistenerId: string, detail: string) {
  await sql`
    UPDATE cases_held SET attempts = attempts + 1, checked_at = now(), detail = ${detail.slice(0, 500)}
    WHERE courtlistener_id = ${courtlistenerId}`;
}

export async function setHeldReason(courtlistenerId: string, reason: HoldReason, detail: string) {
  await sql`
    UPDATE cases_held SET reason = ${reason}, detail = ${detail.slice(0, 500)}, checked_at = now()
    WHERE courtlistener_id = ${courtlistenerId}`;
}
