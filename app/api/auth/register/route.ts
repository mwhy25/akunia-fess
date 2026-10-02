import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashSecret, generateRecoveryCode, normalizeRecovery } from '@/lib/security/password';
import { createSession } from '@/lib/security/session';
import { allow, clientIp } from '@/lib/security/ratelimit';
import { INITIAL_CREDITS } from '@/lib/constants';

const schema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,20}$/, 'Username 3–20 karakter: huruf, angka, atau underscore.'),
  email: z.string().trim().toLowerCase().email('Email tidak valid.').max(254),
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
  const { username, email, password } = parsed.data;

  const recoveryCode = generateRecoveryCode();
  const [password_hash, recovery_hash] = await Promise.all([
    hashSecret(password),
    hashSecret(normalizeRecovery(recoveryCode)),
  ]);

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .insert({ username, email, password_hash, recovery_hash, credits: INITIAL_CREDITS } as any)
    .select('id')
    .single();

  if (error) {
    // 23505 = unique violation (username sudah dipakai)
    if (error.code === '23505') return NextResponse.json({ error: 'Username sudah dipakai.' }, { status: 409 });
    return NextResponse.json({ error: 'Gagal membuat akun.' }, { status: 500 });
  }

  await createSession(data.id);

  // Promo akun baru: catat di ledger agar muncul di daftar transaksi.
  if (INITIAL_CREDITS > 0) {
    await supabaseAdmin.from('credit_transactions').insert({
      user_id: data.id,
      amount: INITIAL_CREDITS,
      type: 'admin',
      note: `bonus akun baru (+${INITIAL_CREDITS}) — nominal Rp0`,
    } as any);
    // Order Rp0 opsional (agar muncul di /admin/orders juga); abaikan jika constraint belum migrasi.
    await supabaseAdmin.from('orders').insert({
      user_id: data.id,
      provider: 'manual',
      provider_ref: `promo_${data.id.slice(0, 8)}_${Date.now()}`,
      package_id: 'promo_new_account',
      amount: 0,
      total_paid: 0,
      credits: INITIAL_CREDITS,
      status: 'paid',
      paid_at: new Date().toISOString(),
      metadata: { promo: true, credits: INITIAL_CREDITS, nominal: 0 } as any,
    } as any);
  }

  // Kode pemulihan HANYA ditampilkan sekali di sini; database hanya menyimpan hash-nya.
  return NextResponse.json({ ok: true, recoveryCode });
}
