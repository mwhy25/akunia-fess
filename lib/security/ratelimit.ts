import 'server-only';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Kind = 'login' | 'register' | 'recover';

const LIMITS: Record<Kind, { max: number; windowMin: number }> = {
  login: { max: 10, windowMin: 15 },
  register: { max: 5, windowMin: 60 },
  recover: { max: 5, windowMin: 60 },
};

export function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  return (fwd?.split(',')[0] || h.get('x-real-ip') || 'unknown').trim().slice(0, 64);
}

// true = boleh lanjut. Mencatat percobaan ini sekaligus.
export async function allow(kind: Kind, ip: string): Promise<boolean> {
  const { max, windowMin } = LIMITS[kind];
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();

  const { count } = await supabaseAdmin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .eq('ip', ip)
    .gte('created_at', since);

  if ((count ?? 0) >= max) return false;
  await supabaseAdmin.from('auth_attempts').insert({ kind, ip });
  return true;
}
