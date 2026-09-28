import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashSecret, verifySecret, generateRecoveryCode, normalizeRecovery, DUMMY_HASH } from '@/lib/security/password';
import { createSession, destroyAllSessions } from '@/lib/security/session';
import { allow, clientIp } from '@/lib/security/ratelimit';

const schema = z.object({
  username: z.string().trim().min(1).max(20),
  recoveryCode: z.string().min(10).max(40),
  newPassword: z.string().min(8, 'Password minimal 8 karakter.').max(128),
});

const GENERIC = 'Username atau kode pemulihan salah.';

// Lupa password: username + kode pemulihan → password baru + kode pemulihan baru.
export async function POST(req: Request) {
  if (!(await allow('recover', clientIp()))) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? GENERIC }, { status: 400 });
  }
  const { username, recoveryCode, newPassword } = parsed.data;

  const { data: acc } = await supabaseAdmin
    .from('accounts')
    .select('id, recovery_hash')
    .ilike('username', username)
    .maybeSingle();

  const ok = await verifySecret(normalizeRecovery(recoveryCode), acc?.recovery_hash ?? DUMMY_HASH);
  if (!acc || !ok) return NextResponse.json({ error: GENERIC }, { status: 401 });

  // Kode pemulihan sekali pakai: langsung diganti kode baru.
  const newCode = generateRecoveryCode();
  const [password_hash, recovery_hash] = await Promise.all([
    hashSecret(newPassword),
    hashSecret(normalizeRecovery(newCode)),
  ]);

  await supabaseAdmin
    .from('accounts')
    .update({ password_hash, recovery_hash, failed_logins: 0, locked_until: null })
    .eq('id', acc.id);

  await destroyAllSessions(acc.id); // tendang semua perangkat lain
  await createSession(acc.id);
  return NextResponse.json({ ok: true, recoveryCode: newCode });
}
