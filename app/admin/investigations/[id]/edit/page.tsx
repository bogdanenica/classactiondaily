import { neon } from '@neondatabase/serverless';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requireAdmin } from '../../../auth';

export const metadata = { robots: { index: false, follow: false } };

const sql = neon(process.env.DATABASE_URL!);

export default async function EditInvestigation({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const invId = parseInt(id, 10);
  if (isNaN(invId)) notFound();

  const rows = await sql`SELECT * FROM investigations WHERE id = ${invId}`;
  const inv = rows[0];
  if (!inv) notFound();

  async function updateInvestigation(formData: FormData) {
    'use server';
    await requireAdmin();
    await sql`
      UPDATE investigations SET
        title = ${formData.get('title')},
        defendant = ${formData.get('defendant')},
        category = ${formData.get('category')},
        allegation = ${formData.get('allegation')},
        affected = ${formData.get('affected')},
        why_matters = ${formData.get('why_matters')},
        updated_date = CURRENT_DATE
      WHERE id = ${invId}
    `;
    revalidatePath('/admin');
    revalidatePath('/investigations');
    revalidatePath(`/investigations/${invId}`);
    redirect('/admin');
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg)' };
  const labelStyle = { display: 'block', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--ink-muted)', margin: '12px 0 4px', fontWeight: 600 };

  return (
    <div className="single-col">
      <div className="breadcrumb"><Link href="/admin">Admin</Link> › Edit investigation</div>
      <h1 style={{ marginBottom: 24 }}>Edit investigation</h1>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 28 }}>
        <form action={updateInvestigation}>
          <label style={labelStyle}>Title</label>
          <input name="title" required defaultValue={inv.title} style={inputStyle} />

          <label style={labelStyle}>Defendant</label>
          <input name="defendant" required defaultValue={inv.defendant} style={inputStyle} />

          <label style={labelStyle}>Category</label>
          <select name="category" required defaultValue={inv.category} style={inputStyle}>
            <option>Health & safety</option>
            <option>Mislabeling</option>
            <option>Hidden fees</option>
            <option>Privacy & data</option>
            <option>Product defect</option>
            <option>False advertising</option>
            <option>Other</option>
          </select>

          <label style={labelStyle}>The allegation</label>
          <textarea name="allegation" required rows={5} defaultValue={inv.allegation} style={inputStyle} />

          <label style={labelStyle}>Who may be affected</label>
          <textarea name="affected" required rows={4} defaultValue={inv.affected} style={inputStyle} />

          <label style={labelStyle}>Why this matters</label>
          <textarea name="why_matters" required rows={4} defaultValue={inv.why_matters} style={inputStyle} />

          <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
            <button type="submit" style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Save changes
            </button>
            <Link href="/admin" style={{ padding: '11px 20px', fontSize: 14, color: 'var(--ink-muted)' }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}