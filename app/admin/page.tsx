import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin, logoutAdmin } from './auth';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export default async function AdminPage() {
  await requireAdmin();

  const investigations = await sql`
    SELECT i.id, i.title, i.defendant, i.category, i.status,
           i.opened_date, i.updated_date, i.source, i.source_url,
           (SELECT COUNT(*)::int FROM leads WHERE investigation_id = i.id) AS lead_count
    FROM investigations i
    ORDER BY (i.status = 'draft') DESC, i.opened_date DESC, i.id DESC
  `;

  const drafts = await sql`
    SELECT id, title, defendant, category, allegation, affected, why_matters,
           opened_date, source, source_url, evidence
    FROM investigations
    WHERE status = 'draft'
    ORDER BY id DESC
  `;

  async function createInvestigation(formData: FormData) {
    'use server';
    await requireAdmin();
    const today = new Date().toISOString().split('T')[0];
    await sql`
      INSERT INTO investigations (
        title, defendant, category, allegation, affected, why_matters,
        opened_date, updated_date
      ) VALUES (
        ${formData.get('title')},
        ${formData.get('defendant')},
        ${formData.get('category')},
        ${formData.get('allegation')},
        ${formData.get('affected')},
        ${formData.get('why_matters')},
        ${today},
        ${today}
      )
    `;
    revalidatePath('/admin');
    revalidatePath('/investigations');
    revalidatePath('/sitemap.xml');
  }

  async function openCase(formData: FormData) {
    'use server';
    await requireAdmin();
    // Accepts "613" or a pasted address like https://www.classactiondaily.com/cases/613
    const m = String(formData.get('caseRef') ?? '').match(/(\d+)\s*\/?\s*$/);
    if (m) redirect(`/admin/cases/${m[1]}/edit`);
  }

  async function approveDraft(formData: FormData) {
    'use server';
    await requireAdmin();
    const id = parseInt(formData.get('id') as string, 10);
    await sql`
      UPDATE investigations
      SET status = 'open', opened_date = CURRENT_DATE, updated_date = CURRENT_DATE
      WHERE id = ${id} AND status = 'draft'
    `;
    revalidatePath('/admin');
    revalidatePath('/investigations');
    revalidatePath(`/investigations/${id}`);
    revalidatePath('/sitemap.xml');
  }

  async function discardDraft(formData: FormData) {
    'use server';
    await requireAdmin();
    const id = parseInt(formData.get('id') as string, 10);
    await sql`DELETE FROM leads WHERE investigation_id = ${id}`;
    await sql`DELETE FROM investigations WHERE id = ${id} AND status = 'draft'`;
    revalidatePath('/admin');
  }

  async function toggleStatus(formData: FormData) {
    'use server';
    await requireAdmin();
    const id = parseInt(formData.get('id') as string, 10);
    const current = formData.get('current') as string;
    const next = current === 'open' ? 'closed' : 'open';
    await sql`UPDATE investigations SET status = ${next}, updated_date = CURRENT_DATE WHERE id = ${id}`;
    revalidatePath('/admin');
    revalidatePath('/investigations');
    revalidatePath(`/investigations/${id}`);
    revalidatePath('/sitemap.xml');
  }

  async function deleteInvestigation(formData: FormData) {
    'use server';
    await requireAdmin();
    const id = parseInt(formData.get('id') as string, 10);
    await sql`DELETE FROM leads WHERE investigation_id = ${id}`;
    await sql`DELETE FROM investigations WHERE id = ${id}`;
    revalidatePath('/admin');
    revalidatePath('/investigations');
    revalidatePath('/sitemap.xml');
  }

  async function logout() {
    'use server';
    await logoutAdmin();
    redirect('/admin/login');
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg)' };
  const labelStyle = { display: 'block', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--ink-muted)', margin: '12px 0 4px', fontWeight: 600 };
  const btnPrimary = { background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' } as const;
  const btnLink = { background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0 } as const;
  const btnDanger = { ...btnLink, color: '#9b2c2c' } as const;
  const sourceLabel = (s: string | null) => s === 'milberg' ? 'Milberg filing trend' : s === 'classaction.org' ? 'ClassAction.org' : s ? s : 'Manual';

  return (
    <div className="single-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1>Admin</h1>
        <form action={logout}>
          <button type="submit" style={{ ...btnLink, color: 'var(--ink-muted)', textDecoration: 'underline' }}>Log out</button>
        </form>
      </div>

      {/* ---------------- Cases ---------------- */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Cases</h2>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          <Link href="/admin/cases/new" style={{ fontWeight: 600 }}>Add a case from a complaint</Link>
          <span style={{ color: 'var(--ink-muted)' }}> (state court or anything the daily feed missed)</span>
        </p>
        <form action={openCase} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="caseRef" style={{ fontSize: 14 }}>Edit or star an existing case:</label>
          <input id="caseRef" name="caseRef" placeholder="case number from the page address, e.g. 613" style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, fontSize: 14, minWidth: 300 }} />
          <button type="submit" style={{ padding: '6px 14px', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>Open</button>
        </form>
      </div>

      {/* ---------------- Drafts awaiting review ---------------- */}
      <div style={{ background: '#fffaf0', border: '1px solid #e8d9b5', borderLeft: '4px solid var(--accent)', borderRadius: 6, padding: 24, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Awaiting your review ({drafts.length})</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: drafts.length ? 18 : 0 }}>
          Proposed automatically from Milberg filing trends and new ClassAction.org investigations. Nothing here is public. Approve to publish, Edit to change the text first, or Discard.
        </p>
        {drafts.map((d: any) => {
          const evidence: any[] = Array.isArray(d.evidence) ? d.evidence : [];
          return (
            <details key={d.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 16px', marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>
                {d.title}
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-muted)', marginLeft: 10 }}>
                  {sourceLabel(d.source)} · {d.category} · {new Date(d.opened_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </summary>
              <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55 }}>
                <p><strong>Under investigation:</strong> {d.defendant}</p>
                <p style={{ marginTop: 10 }}><strong>The allegation.</strong> {d.allegation}</p>
                <p style={{ marginTop: 10 }}><strong>Who may be affected.</strong> {d.affected}</p>
                <p style={{ marginTop: 10 }}><strong>Why this matters.</strong> {d.why_matters}</p>
                {evidence.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 13 }}>
                    <strong>Evidence</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {evidence.map((e, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.label}</a> : e.label}
                          {e.date && <span style={{ color: 'var(--ink-muted)' }}> ({e.date})</span>}
                          {e.detail && <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{e.detail}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.source_url && !evidence.some((e) => e.url === d.source_url) && (
                  <p style={{ marginTop: 8, fontSize: 13 }}>Source: <a href={d.source_url} target="_blank" rel="noopener noreferrer">{d.source_url}</a></p>
                )}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
                  <form action={approveDraft}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" style={btnPrimary}>Approve &amp; publish</button>
                  </form>
                  <Link href={`/admin/investigations/${d.id}/edit`} style={{ fontSize: 13 }}>Edit first</Link>
                  <form action={discardDraft}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" style={btnDanger}>Discard</button>
                  </form>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {/* ---------------- Manual create ---------------- */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 28, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Launch new investigation</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 16 }}>
          This appears immediately on /investigations. Opened and last-updated dates set to today automatically.
        </p>
        <form action={createInvestigation}>
          <label style={labelStyle}>Title (in question form)</label>
          <input name="title" required placeholder="Did you use X and experience Y?" style={inputStyle} />

          <label style={labelStyle}>Defendant or products under investigation</label>
          <input name="defendant" required placeholder="Brand X, Brand Y, and similar products" style={inputStyle} />

          <label style={labelStyle}>Category</label>
          <select name="category" required defaultValue="" style={inputStyle}>
            <option value="" disabled>Select a category</option>
            <option>Health & safety</option>
            <option>Mislabeling</option>
            <option>Hidden fees</option>
            <option>Privacy & data</option>
            <option>Product defect</option>
            <option>False advertising</option>
            <option>Other</option>
          </select>

          <label style={labelStyle}>The allegation</label>
          <textarea name="allegation" required rows={4} placeholder="Attorneys are investigating whether..." style={inputStyle} />

          <label style={labelStyle}>Who may be affected</label>
          <textarea name="affected" required rows={3} placeholder="Consumers who..." style={inputStyle} />

          <label style={labelStyle}>Why this matters</label>
          <textarea name="why_matters" required rows={3} placeholder="A recent study / regulatory action / etc..." style={inputStyle} />

          <button type="submit" style={{ ...btnPrimary, marginTop: 18, padding: '11px 20px' }}>Launch investigation</button>
        </form>
      </div>

      {/* ---------------- All investigations ---------------- */}
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>All investigations ({investigations.length})</h2>
      {investigations.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)' }}>None yet.</p>
      ) : (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-alt)', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)' }}>
                <th style={{ padding: '10px 14px' }}>Title</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Leads</th>
                <th style={{ padding: '10px 14px' }}>Opened</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((inv: any) => (
                <tr key={inv.id} style={{ borderTop: '1px solid var(--border)', background: inv.status === 'draft' ? '#fffaf0' : undefined }}>
                  <td style={{ padding: '10px 14px', maxWidth: 360 }}>
                    <div style={{ fontWeight: 500 }}>{inv.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{inv.category} · {sourceLabel(inv.source)}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={inv.status === 'open' ? 'tag investigation' : 'tag'}>{inv.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{inv.lead_count}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink-muted)', fontSize: 13 }}>
                    {new Date(inv.opened_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link href={`/admin/investigations/${inv.id}/edit`} style={{ fontSize: 13, marginRight: 12 }}>Edit</Link>
                    {inv.status === 'draft' ? (
                      <>
                        <form action={approveDraft} style={{ display: 'inline', marginRight: 12 }}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button type="submit" style={btnLink}>Approve</button>
                        </form>
                        <form action={discardDraft} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button type="submit" style={btnDanger}>Discard</button>
                        </form>
                      </>
                    ) : (
                      <>
                        <form action={toggleStatus} style={{ display: 'inline', marginRight: 12 }}>
                          <input type="hidden" name="id" value={inv.id} />
                          <input type="hidden" name="current" value={inv.status} />
                          <button type="submit" style={btnLink}>{inv.status === 'open' ? 'Close' : 'Reopen'}</button>
                        </form>
                        <form action={deleteInvestigation} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button type="submit" style={btnDanger}>Delete</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 20 }}>
        The scout job runs daily. To run it now, open <code>/api/cron/scout?key=YOUR_CRON_SECRET</code>; add <code>&amp;dry=1</code> to preview without creating drafts.
      </p>
    </div>
  );
}
