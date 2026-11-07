import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashSecret, generateRecoveryCode, normalizeRecovery } from '@/lib/security/password';
import { createSession } from '@/lib/security/session';
import { allow, record, clientIp } from '@/lib/security/ratelimit';
import { INITIAL_CREDITS } from '@/lib/constants';

// Nama yang tidak boleh dipakai user (mencegah peniruan identitas/admin).
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'mod', 'moderator', 'staff', 'system',
  'support', 'official', 'help', 'menfess', 'owner', 'security',
]);

const schema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,20}$/, 'Username 3–20 karakter: huruf, angka, atau underscore.'),
  email: z.string().trim().toLowerCase().email('Email tidak valid.').max(254),
  password: z.string().min(8, 'Password minimal 8 karakter.').max(128, 'Password terlalu panjang.'),
});

export async function POST(req: Request) {
  const ip = clientIp();
  if (!(await allow('register', ip))) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });
  }
  // Pendaftaran dihitung semua percobaan (bukan cuma yang gagal) untuk
  // membatasi pembuatan akun spam.
  await record('register', ip);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, email, password } = parsed.data;

  if (RESERVED.has(username.toLowerCase())) {
    return NextResponse.json({ error: 'Username ini tidak tersedia.' }, { status: 409 });
  }

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
  // Bookkeeping TIDAK boleh menggagalkan pendaftaran — kalau gagal, cukup
  // dicatat di log (kredit di akun sudah diberikan oleh insert di atas).
  if (INITIAL_CREDITS > 0) {
    try {
      const { error: ledgerErr } = await supabaseAdmin.from('credit_transactions').insert({
        user_id: data.id,
        amount: INITIAL_CREDITS,
        type: 'admin',
        note: `bonus akun baru (+${INITIAL_CREDITS}) — nominal Rp0`,
      } as any);
      if (ledgerErr) console.warn('[register] ledger promo gagal:', ledgerErr.message);

      const { error: orderErr } = await supabaseAdmin.from('orders').insert({
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
      if (orderErr) console.warn('[register] order promo gagal (jalankan migration_2025_fixes.sql):', orderErr.message);
    } catch (e: any) {
      console.warn('[register] bookkeeping promo error:', e?.message ?? e);
    }
  }

  // Kode pemulihan HANYA ditampilkan sekali di sini; database hanya menyimpan hash-nya.
  return NextResponse.json({ ok: true, recoveryCode });
}
