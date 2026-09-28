import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashSecret, generateRecoveryCode, normalizeRecovery } from '@/lib/security/password';
import { createSession } from '@/lib/security/session';
import { allow, clientIp } from '@/lib/security/ratelimit';

const schema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,20}$/, 'Username 3–20 karakter: huruf, angka, atau underscore.'),
  password: z.string().min(8, 'Password minimal 8 karakter.').max(128, 'Password terlalu panjang.'),
});

export async function POST(req: Request) {
  if (!(await allow('register', clientIp()))) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const recoveryCode = generateRecoveryCode();
  const [password_hash, recovery_hash] = await Promise.all([
    hashSecret(password),
    hashSecret(normalizeRecovery(recoveryCode)),
  ]);

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .insert({ username, password_hash, recovery_hash })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique violation (username sudah dipakai)
    if (error.code === '23505') return NextResponse.json({ error: 'Username sudah dipakai.' }, { status: 409 });
    return NextResponse.json({ error: 'Gagal membuat akun.' }, { status: 500 });
  }

  await createSession(data.id);
  // Kode pemulihan HANYA ditampilkan sekali di sini; database hanya menyimpan hash-nya.
  return NextResponse.json({ ok: true, recoveryCode });
}
