import { cookies } from 'next/headers';
import crypto from 'crypto';
import { redirect } from 'next/navigation';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function sign(value: string): string {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update(value).digest('hex');
}

export async function loginAdmin(password: string): Promise<boolean> {
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) return false;
  const c = await cookies();
  c.set('admin_session', sign('valid'), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });
  return true;
}

export async function logoutAdmin() {
  const c = await cookies();
  c.delete('admin_session');
}

export async function isAdminAuthenticated(): Promise<boolean> {
  if (!ADMIN_PASSWORD) return false;
  const c = await cookies();
  const token = c.get('admin_session')?.value;
  if (!token) return false;
  return token === sign('valid');
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login');
  }
}