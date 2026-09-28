import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  credits: number;
  role: 'user' | 'admin';
  is_banned: boolean;
  created_at: string;
}

// cache(): satu request = satu kali query, walau dipanggil berkali-kali.
export const getUser = cache(async (): Promise<Profile | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (profile as Profile) ?? null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}
