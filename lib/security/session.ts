import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sha256 } from './password';

export const SESSION_COOKIE = 'mf_session';
const SESSION_DAYS = 30;

export async function createSession(accountId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);

  const { error } = await supabaseAdmin.from('sessions').insert({
    account_id: accountId,
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
  });
  if (error) throw new Error('Gagal membuat sesi');

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await supabaseAdmin.from('sessions').delete().eq('token_hash', sha256(token));
  cookies().delete(SESSION_COOKIE);
}

// Hapus SEMUA sesi akun (dipakai setelah ganti password / reset).
export async function destroyAllSessions(accountId: string) {
  await supabaseAdmin.from('sessions').delete().eq('account_id', accountId);
}

// Kembalikan account_id kalau sesi valid, selain itu null.
export async function readSession(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20) return null;

  const { data } = await supabaseAdmin
    .from('sessions')
    .select('id, account_id, expires_at')
    .eq('token_hash', sha256(token))
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data.account_id;
}
