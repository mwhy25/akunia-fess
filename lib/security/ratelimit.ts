import 'server-only';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Kind = 'login' | 'register' | 'recover' | 'upload';

const LIMITS: Record<Kind, { max: number; windowMin: number }> = {
  login: { max: 10, windowMin: 15 },
  register: { max: 5, windowMin: 60 },
  recover: { max: 5, windowMin: 60 },
  upload: { max: 30, windowMin: 60 },
};

export function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  // Ambil entri TERAKHIR yang ditambahkan proxy tepercaya, bukan yang pertama
  // (entri pertama bisa dipalsukan client lewat header X-Forwarded-For).
  const parts = fwd?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = parts.length > 0 ? parts[parts.length - 1] : h.get('x-real-ip') || 'unknown';
  return ip.slice(0, 64);
}

// Cek kuota TANPA mencatat. Pencatatan dilakukan terpisah lewat record(),
// supaya login yang BERHASIL tidak ikut memakan kuota percobaan.
export async function allow(kind: Kind, ip: string): Promise<boolean> {
  const { max, windowMin } = LIMITS[kind];
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();

  const { count } = await supabaseAdmin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .eq('ip', ip)
    .gte('created_at', since);

  return (count ?? 0) < max;
}

// Catat satu percobaan (dipakai untuk percobaan gagal / aktivitas sensitif).
export async function record(kind: Kind, ip: string): Promise<void> {
  await supabaseAdmin.from('auth_attempts').insert({ kind, ip });
}
