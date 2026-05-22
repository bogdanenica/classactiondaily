import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin, logoutAdmin } from './auth';

export const metadata = { robots: { index: false, follow: false } };

const sql = neon(process.env.DATABASE_URL!);

export default async function AdminPage() {
  await requireAdmin();

  const investigations = await sql`
    SELECT i.id, i.title, i.defendant, i.category, i.status,
           i.opened_date, i.updated_date,
           (SELECT COUNT(*)::int FROM leads WHERE investigation_id = i.id) AS lead_count
    FROM investigations i
    ORDER BY i.opened_date DESC
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
  }

  async function deleteInvestigation(formData: FormData) {
    'use server';
    await requireAdmin();
    const id = parseInt(formData.get('id') as string, 10);
    await sql`DELETE FROM leads WHERE investigation_id = ${id}`;
    await sql`DELETE FROM investigations WHERE id = ${id}`;
    revalidatePath('/admin');
    revalidatePath('/investigations');
  }

  async function logout() {
    'use server';
    await logoutAdmin();
    redirect('/admin/login');
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg)' };
  const labelStyle = { display: 'block', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--ink-muted)', margin: '12px 0 4px', fontWeight: 600 };

  return (
    <div className="single-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1>Admin · Investigations</h1>
        <form action={logout}>
          <button type="submit" style={{ background: 'transparent', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
            Log out
          </button>
        </form>
      </div>

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

          <button type="submit" style={{ marginTop: 18, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Launch investigation
          </button>
        </form>
      </div>

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
                <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', maxWidth: 360 }}>
                    <div style={{ fontWeight: 500 }}>{inv.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{inv.category}</div>
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
                    <form action={toggleStatus} style={{ display: 'inline', marginRight: 12 }}>
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="current" value={inv.status} />
                      <button type="submit" style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                        {inv.status === 'open' ? 'Close' : 'Reopen'}
                      </button>
                    </form>
                    <form action={deleteInvestigation} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button type="submit" style={{ background: 'transparent', border: 'none', color: '#9b2c2c', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}