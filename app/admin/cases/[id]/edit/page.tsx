import { neon } from '@neondatabase/serverless';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '../../../auth';
import { CATEGORIES } from '../../../../lib/site';
import { STATUS_LABEL, asStatus } from '../../../../lib/caseStatus';
import { unpublish } from '../../../../lib/caseHold';
import { tidy } from '../../../../lib/caseQuality';
import { generateImagePrompt, generateAndStoreImage, IMAGE_VERSION } from '../../../../lib/imageGen';

export const metadata = { title: 'Edit case', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const sql = neon(process.env.DATABASE_URL!);
const ALLEGATIONS = ['False advertising', 'Mislabeling', 'Auto-renewal', 'Product defect', 'Pricing', 'Privacy', 'Other'];

const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, fontSize: 15, fontFamily: 'inherit' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, margin: '14px 0 4px' };
const btn: React.CSSProperties = { padding: '10px 18px', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 4, fontSize: 15, cursor: 'pointer' };

type Params = Promise<{ id: string }>;
type Search = Promise<{ saved?: string; blocked?: string }>;

export default async function EditCasePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireAdmin();
  const { id: idRaw } = await params;
  const { saved, blocked } = await searchParams;
  const id = parseInt(idRaw, 10);
  if (isNaN(id)) notFound();
  const rows = await sql`SELECT * FROM cases WHERE id = ${id}`;
  const c = rows[0];
  if (!c) notFound();

  async function save(formData: FormData) {
    'use server';
    await requireAdmin();
    const str = (k: string, max = 500) => String(formData.get(k) ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const category = (CATEGORIES as readonly string[]).includes(str('category')) ? str('category') : 'Other';
    const allegation = ALLEGATIONS.includes(str('allegation_type')) ? str('allegation_type') : 'Other';
    const summary = tidy(String(formData.get('summary') ?? '')).slice(0, 4000);
    const curated = formData.get('curated') === 'on';
    const firm = formData.get('firm_represents') === 'on';
    const link = str('raw_complaint_url', 1000);
    const newStatus = str('status');
    const dateFiled = str('date_filed', 10);
    const summaryChanged = summary !== String(formData.get('summary_before') ?? '');

    await sql`
      UPDATE cases SET
        case_name = ${str('case_name', 300)},
        defendant = ${str('defendant', 300)},
        court_name = ${str('court_name', 200)},
        docket_number = ${str('docket_number', 100) || null},
        date_filed = COALESCE(${/^\d{4}-\d{2}-\d{2}$/.test(dateFiled) ? dateFiled : null}::date, date_filed),
        category = ${category},
        allegation_type = ${allegation},
        summary = ${summary},
        raw_complaint_url = ${/^https?:\/\//i.test(link) ? link : null},
        curated = ${curated},
        curated_at = CASE WHEN ${curated} THEN COALESCE(curated_at, now()) ELSE NULL END,
        firm_represents = ${firm},
        -- An attorney-edited or starred summary is no longer a bare docket note.
        summary_source = CASE WHEN ${curated || summaryChanged} THEN 'complaint' ELSE summary_source END
      WHERE id = ${id}
    `;
    if (newStatus && newStatus !== 'unchanged' && newStatus in STATUS_LABEL) {
      await sql`UPDATE cases SET status = ${newStatus}, status_basis = 'set by attorney', status_checked_at = now() WHERE id = ${id}`;
    }
    if (formData.get('new_image') === 'on') {
      try {
        const prompt = await generateImagePrompt({
          caseName: str('case_name', 300), defendant: str('defendant', 300), category, allegation, summary,
        });
        const url = await generateAndStoreImage(prompt, `cases/edit-${id}-${Date.now()}-${IMAGE_VERSION}`);
        await sql`UPDATE cases SET image_url = ${url} WHERE id = ${id}`;
      } catch (err) {
        console.error('[admin] image regeneration failed:', err);
      }
    }
    revalidatePath(`/cases/${id}`);
    revalidatePath('/');
    redirect(`/admin/cases/${id}/edit?saved=1`);
  }

  async function remove() {
    'use server';
    await requireAdmin();
    const done = await unpublish(id, 'removed', 'removed by attorney');
    revalidatePath(`/cases/${id}`);
    revalidatePath('/');
    revalidatePath('/sitemap.xml');
    if (!done) redirect(`/admin/cases/${id}/edit?blocked=1`);
    redirect('/admin');
  }

  const status = asStatus(c.status);
  const filed = c.date_filed ? new Date(c.date_filed).toISOString().slice(0, 10) : '';

  return (
    <div className="single-col">
      <p style={{ fontSize: 13, marginBottom: 12 }}><Link href="/admin">← Back to admin</Link> · <Link href={`/cases/${id}`} target="_blank">View public page</Link></p>
      <h1 style={{ marginBottom: 16 }}>Edit case {id}</h1>
      {saved && <p style={{ background: '#eef7ee', border: '1px solid #b9d8b9', borderRadius: 4, padding: '8px 12px', maxWidth: 760 }}>Saved. The public page updates within a minute.</p>}
      {blocked && <p style={{ background: '#fff4f4', border: '1px solid #e5b5b5', borderRadius: 4, padding: '8px 12px', maxWidth: 760 }}>This case has form submissions attached, so it was not removed. Edit the summary instead.</p>}

      <form action={save} style={{ maxWidth: 760 }}>
        <input type="hidden" name="summary_before" value={c.summary ?? ''} />
        <label style={label} htmlFor="case_name">Case name</label>
        <input id="case_name" name="case_name" style={field} defaultValue={c.case_name ?? ''} required />
        <label style={label} htmlFor="defendant">Defendant</label>
        <input id="defendant" name="defendant" style={field} defaultValue={c.defendant ?? ''} required />
        <label style={label} htmlFor="court_name">Court</label>
        <input id="court_name" name="court_name" style={field} defaultValue={c.court_name ?? ''} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={label} htmlFor="docket_number">Case number</label>
            <input id="docket_number" name="docket_number" style={field} defaultValue={c.docket_number ?? ''} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={label} htmlFor="date_filed">Date filed</label>
            <input id="date_filed" name="date_filed" type="date" style={field} defaultValue={filed} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={label} htmlFor="category">Category</label>
            <select id="category" name="category" style={field} defaultValue={c.category ?? 'Other'}>
              {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label style={label} htmlFor="allegation_type">Type of claim</label>
            <select id="allegation_type" name="allegation_type" style={field} defaultValue={c.allegation_type ?? 'Other'}>
              {ALLEGATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <label style={label} htmlFor="raw_complaint_url">Link to the docket or complaint</label>
        <input id="raw_complaint_url" name="raw_complaint_url" style={field} defaultValue={c.raw_complaint_url ?? ''} placeholder="https://" />

        <label style={label} htmlFor="summary">Summary</label>
        <textarea id="summary" name="summary" style={{ ...field, minHeight: 220, lineHeight: 1.5 }} defaultValue={c.summary ?? ''} required />

        <label style={label} htmlFor="status">Case status <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(now: {STATUS_LABEL[status]}{c.status_checked_at ? `, checked ${new Date(c.status_checked_at).toLocaleDateString('en-US')}` : ', never checked'})</span></label>
        <select id="status" name="status" style={field} defaultValue="unchanged">
          <option value="unchanged">Leave as is</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v} ({k.replace(/_/g, ' ')})</option>)}
        </select>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 18, fontSize: 14 }}>
          <input type="checkbox" name="curated" defaultChecked={c.curated === true} style={{ marginTop: 3 }} />
          <span><strong>★ I have reviewed this summary against the complaint.</strong> The page shows a star and says the summary was reviewed by an attorney before publication. The nightly job will not overwrite a starred summary.</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 14 }}>
          <input type="checkbox" name="firm_represents" defaultChecked={c.firm_represents === true} style={{ marginTop: 3 }} />
          <span><strong>Our firm represents the plaintiffs in this case.</strong> The page will say so.</span>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 14 }}>
          <input type="checkbox" name="new_image" style={{ marginTop: 3 }} />
          <span><strong>Make a new image from this summary.</strong> Use this when the picture no longer matches the case. Saving takes up to a minute.</span>
        </label>

        <div style={{ marginTop: 20 }}>
          <button type="submit" style={btn}>Save</button>
        </div>
      </form>

      <form action={remove} style={{ maxWidth: 760, marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 8 }}>Take this page off the site. It is saved and can be restored; it is not deleted.</p>
        <button type="submit" style={{ ...btn, background: '#8a2b2b' }}>Remove from site</button>
      </form>
    </div>
  );
}
