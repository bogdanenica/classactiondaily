import Link from 'next/link';
import { requireAdmin } from '../../auth';
import NewCaseForm from './NewCaseForm';

export const metadata = { title: 'Add a case', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NewCasePage() {
  await requireAdmin();
  return (
    <div className="single-col">
      <p style={{ fontSize: 13, marginBottom: 12 }}><Link href="/admin">← Back to admin</Link></p>
      <h1 style={{ marginBottom: 6 }}>Add a case</h1>
      <p style={{ color: 'var(--ink-muted)', marginBottom: 24, maxWidth: 680 }}>
        For a case the daily feed did not pick up: a state court filing, or any other complaint you have. Attach the complaint, review the draft, then publish. Nothing is public until you click Publish.
      </p>
      <NewCaseForm />
    </div>
  );
}
