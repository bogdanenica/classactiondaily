import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { caseId, investigationId, fullName, email, phone, state, description, consent } = body;

    if (!fullName || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    if (!consent) {
      return NextResponse.json({ error: 'You must consent to be contacted' }, { status: 400 });
    }
    if (!caseId && !investigationId) {
      return NextResponse.json({ error: 'Missing case or investigation reference' }, { status: 400 });
    }

    await sql`
      INSERT INTO leads (
        case_id, investigation_id, full_name, email, phone, state, description, consent_given
      ) VALUES (
        ${caseId ?? null}, ${investigationId ?? null},
        ${fullName}, ${email}, ${phone ?? null}, ${state ?? null},
        ${description ?? null}, ${consent}
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}