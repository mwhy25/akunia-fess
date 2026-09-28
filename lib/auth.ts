import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { readSession } from '@/lib/security/session';

export interface Profile {
  id: string;
  username: string;
  email: string | null; // dipertahankan agar komponen lama tetap cocok; selalu null
  credits: number;
  role: 'user' | 'admin';
  is_banned: boolean;
  created_at: string;
}

// cache(): satu request = satu kali query, walau dipanggil berkali-kali.
export const getUser = cache(async (): Promise<Profile | null> => {
  const accountId = await readSession();
  if (!accountId) return null;

  const { data } = await supabaseAdmin
    .from('accounts')
    .select('id, username, credits, role, is_banned, created_at')
    .eq('id', accountId)
    .maybeSingle();

  return data ? ({ ...data, email: null } as Profile) : null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/?auth=login');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}
