import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  hashSecret,
  verifySecret,
  generateRecoveryCode,
  normalizeRecovery,
} from '@/lib/security/password';

const schema = z.object({ current: z.string().min(1).max(128) });

// Buat kode pemulihan BARU (kode lama langsung hangus). Wajib konfirmasi
// password supaya sesi yang dicuri tidak bisa mengunci pemilik asli.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });

  const { data: acc } = await supabaseAdmin
    .from('accounts')
    .select('password_hash')
    .eq('id', user.id)
    .single();

  if (!acc || !(await verifySecret(parsed.data.current, acc.password_hash))) {
    return NextResponse.json({ error: 'Password salah.' }, { status: 403 });
  }

  const recoveryCode = generateRecoveryCode();
  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ recovery_hash: await hashSecret(normalizeRecovery(recoveryCode)) })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'Gagal membuat kode baru.' }, { status: 500 });

  return NextResponse.json({ ok: true, recoveryCode });
}
