import { redirect } from 'next/navigation';
import { loginAdmin, isAdminAuthenticated } from '../auth';

export const metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdminAuthenticated()) redirect('/admin');
  const params = await searchParams;
  const hasError = params.error === '1';

  async function login(formData: FormData) {
    'use server';
    const password = formData.get('password') as string;
    const ok = await loginAdmin(password);
    if (ok) redirect('/admin');
    redirect('/admin/login?error=1');
  }

  return (
    <div className="single-col" style={{ maxWidth: 400, paddingTop: 60 }}>
      <h1 style={{ marginBottom: 24 }}>Admin login</h1>
      <form action={login}>
        <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)', display: 'block', marginBottom: 6, fontWeight: 600 }}>
          Password
        </label>
        <input
          type="password"
          name="password"
          required
          autoFocus
          style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg)' }}
        />
        {hasError && (
          <div style={{ background: '#fdecec', border: '1px solid #f5b5b5', color: '#9b2c2c', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginTop: 12 }}>
            Incorrect password.
          </div>
        )}
        <button
          type="submit"
          style={{ width: '100%', marginTop: 14, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Log in
        </button>
      </form>
    </div>
  );
}