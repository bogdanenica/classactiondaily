'use client';

import { useState } from 'react';
import { CATEGORIES } from '../../../lib/site';

const ALLEGATIONS = ['False advertising', 'Mislabeling', 'Auto-renewal', 'Product defect', 'Pricing', 'Privacy', 'Other'];

const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, fontSize: 15, fontFamily: 'inherit' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, margin: '14px 0 4px' };
const btn: React.CSSProperties = { padding: '10px 18px', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 4, fontSize: 15, cursor: 'pointer' };
const box: React.CSSProperties = { background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24, maxWidth: 760 };

type Draft = { consumer: boolean; reason: string; defendant: string; category: string; allegation_type: string; summary: string };

export default function NewCaseForm() {
  const [caseName, setCaseName] = useState('');
  const [court, setCourt] = useState('');
  const [docketNumber, setDocketNumber] = useState('');
  const [dateFiled, setDateFiled] = useState('');
  const [link, setLink] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [text, setText] = useState('');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [curated, setCurated] = useState(false);
  const [firmRepresents, setFirmRepresents] = useState(false);

  const [busy, setBusy] = useState<'' | 'reading' | 'publishing'>('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; url: string; imageError: string | null } | null>(null);

  async function readComplaint() {
    setError(null);
    if (!caseName.trim()) { setError('Enter the case name first.'); return; }
    if (!pdf && text.trim().length < 1500) { setError('Attach the complaint PDF, or paste at least a few pages of its text.'); return; }
    if (pdf && pdf.size > 4 * 1024 * 1024) { setError(`That PDF is ${(pdf.size / 1048576).toFixed(1)} MB. The limit is 4 MB. Compress it, or paste the text instead.`); return; }
    setBusy('reading');
    try {
      const fd = new FormData();
      fd.set('caseName', caseName);
      fd.set('court', court);
      if (pdf) fd.set('pdf', pdf); else fd.set('text', text);
      const res = await fetch('/api/admin/cases/draft', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || (res.status === 413 ? 'The file is too large. Try a smaller PDF or paste the text.' : 'Could not read the complaint.'));
      else setDraft(data.draft);
    } catch {
      setError('Network problem. Please try again.');
    }
    setBusy('');
  }

  async function publish() {
    if (!draft) return;
    setError(null);
    setBusy('publishing');
    try {
      const res = await fetch('/api/admin/cases/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseName, court, docketNumber, dateFiled, link,
          defendant: draft.defendant, category: draft.category, allegationType: draft.allegation_type, summary: draft.summary,
          curated, firmRepresents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Could not publish.');
      else setDone(data);
    } catch {
      setError('Network problem. Please try again.');
    }
    setBusy('');
  }

  if (done) {
    return (
      <div style={box}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Published</h2>
        <p><a href={done.url} target="_blank" rel="noopener noreferrer">View the case page</a> (it can take a minute to appear in the lists).</p>
        {done.imageError && <p style={{ color: '#a33', fontSize: 13, marginTop: 8 }}>The image could not be generated ({done.imageError}). The page is live without one.</p>}
        <p style={{ marginTop: 14 }}><a href="/admin/cases/new">Add another</a> · <a href={`/admin/cases/${done.id}/edit`}>Edit this case</a></p>
      </div>
    );
  }

  return (
    <>
      <div style={box}>
        <h2 style={{ fontSize: 17, marginBottom: 2 }}>1. The case</h2>
        <label style={label} htmlFor="caseName">Case name</label>
        <input id="caseName" style={field} value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="Doe v. Acme Foods, Inc." />
        <label style={label} htmlFor="court">Court</label>
        <input id="court" style={field} value={court} onChange={(e) => setCourt(e.target.value)} placeholder="Circuit Court of Cook County, Illinois" />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={label} htmlFor="docketNumber">Case number</label>
            <input id="docketNumber" style={field} value={docketNumber} onChange={(e) => setDocketNumber(e.target.value)} placeholder="2026-CH-01234" />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={label} htmlFor="dateFiled">Date filed</label>
            <input id="dateFiled" type="date" style={field} value={dateFiled} onChange={(e) => setDateFiled(e.target.value)} />
          </div>
        </div>
        <label style={label} htmlFor="link">Link to the docket or complaint <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span></label>
        <input id="link" style={field} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />

        <label style={label} htmlFor="pdf">Complaint PDF <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(up to 4 MB and 100 pages; scanned PDFs are fine)</span></label>
        <input id="pdf" type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Or paste the complaint text instead</summary>
          <textarea style={{ ...field, minHeight: 160, marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the complaint here (the first 20 to 30 pages are enough)." />
        </details>

        <div style={{ marginTop: 18 }}>
          <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={Boolean(busy)} onClick={readComplaint}>
            {busy === 'reading' ? 'Reading the complaint (up to a minute)…' : draft ? 'Read the complaint again' : 'Read the complaint and draft a summary'}
          </button>
        </div>
      </div>

      {draft && (
        <div style={box}>
          <h2 style={{ fontSize: 17, marginBottom: 2 }}>2. Review the draft</h2>
          {!draft.consumer && (
            <p style={{ background: '#fff4f4', border: '1px solid #e5b5b5', borderRadius: 4, padding: '8px 12px', fontSize: 14, marginTop: 10 }}>
              <strong>Check this one.</strong> The draft does not read as a consumer class action: {draft.reason || 'no reason given'}. You can still publish it.
            </p>
          )}
          <label style={label} htmlFor="defendant">Defendant (as shown on the site)</label>
          <input id="defendant" style={field} value={draft.defendant} onChange={(e) => setDraft({ ...draft, defendant: e.target.value })} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={label} htmlFor="category">Category</label>
              <select id="category" style={field} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={label} htmlFor="allegation">Type of claim</label>
              <select id="allegation" style={field} value={draft.allegation_type} onChange={(e) => setDraft({ ...draft, allegation_type: e.target.value })}>
                {ALLEGATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <label style={label} htmlFor="summary">Summary <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(edit freely; {draft.summary.trim().split(/\s+/).filter(Boolean).length} words)</span></label>
          <textarea id="summary" style={{ ...field, minHeight: 200, lineHeight: 1.5 }} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 16, fontSize: 14 }}>
            <input type="checkbox" checked={curated} onChange={(e) => setCurated(e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>★ I have reviewed this summary against the complaint.</strong> The page will show a star and say the summary was reviewed by an attorney before publication.</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 14 }}>
            <input type="checkbox" checked={firmRepresents} onChange={(e) => setFirmRepresents(e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>Our firm represents the plaintiffs in this case.</strong> The page will say so.</span>
          </label>

          <div style={{ marginTop: 18 }}>
            <button type="button" style={{ ...btn, background: 'var(--accent)', opacity: busy ? 0.6 : 1 }} disabled={Boolean(busy)} onClick={publish}>
              {busy === 'publishing' ? 'Publishing and generating the image (up to a minute)…' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#a33', maxWidth: 760 }}>{error}</p>}
    </>
  );
}
