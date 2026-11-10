import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/app/admin/auth';
import { summarizeFromPdf, summarizeFromComplaint, tidy } from '@/app/lib/caseQuality';

// Step 1 of adding a case by hand: read the complaint and draft a summary.
// Nothing is saved here. The draft goes back to the admin form for review.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_PDF_BYTES = 4 * 1024 * 1024; // the host rejects uploads much larger than this

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'The upload was too large or could not be read. Try a smaller PDF, or paste the complaint text instead.' }, { status: 413 });
  }
  const caseName = String(form.get('caseName') ?? '').trim();
  const court = String(form.get('court') ?? '').trim();
  const pasted = String(form.get('text') ?? '').trim();
  const file = form.get('pdf');

  if (!caseName) return NextResponse.json({ error: 'Enter the case name first.' }, { status: 400 });

  try {
    let s;
    if (file && typeof file !== 'string' && file.size > 0) {
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: `That PDF is ${(file.size / 1048576).toFixed(1)} MB. The limit is 4 MB. Compress it, or paste the complaint text instead.` }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return NextResponse.json({ error: 'That file is not a PDF.' }, { status: 400 });
      }
      s = await summarizeFromPdf({ caseName, court, pdfBase64: buf.toString('base64') });
    } else if (pasted.length >= 1500) {
      s = await summarizeFromComplaint({ caseName, court, complaint: pasted });
    } else {
      return NextResponse.json({ error: 'Attach the complaint PDF, or paste at least a few pages of its text.' }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      draft: {
        consumer: Boolean(s.consumer),
        reason: s.reason ?? '',
        defendant: s.defendant ?? '',
        category: s.category ?? 'Other',
        allegation_type: s.allegation_type ?? 'Other',
        summary: tidy(String(s.summary ?? '')),
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const hint = /page|too large|too long|100/i.test(msg) ? ' The PDF may be too long (over 100 pages). Paste the first 20 to 30 pages of text instead.' : '';
    return NextResponse.json({ error: `Could not read the complaint.${hint}`, detail: msg.slice(0, 300) }, { status: 500 });
  }
}
