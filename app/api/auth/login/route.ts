import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifySecret, DUMMY_HASH } from '@/lib/security/password';
import { createSession } from '@/lib/security/session';
import { allow, clientIp } from '@/lib/security/ratelimit';

const schema = z.object({ username: z.string().trim().min(1).max(20), password: z.string().min(1).max(128) });

const MAX_FAILS = 5;
const LOCK_MIN = 15;
const GENERIC = 'Username atau password salah.';

export async function POST(req: Request) {
  if (!(await allow('login', clientIp()))) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: GENERIC }, { status: 400 });
  const { username, password } = parsed.data;

  const { data: acc } = await supabaseAdmin
    .from('accounts')
    .select('id, password_hash, failed_logins, locked_until, is_banned')
    .ilike('username', username)
    .maybeSingle();

  // Selalu jalankan verifikasi (walau akun tidak ada) agar waktu respons sama.
  const ok = await verifySecret(password, acc?.password_hash ?? DUMMY_HASH);

  if (acc?.locked_until && new Date(acc.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Akun dikunci sementara. Coba lagi beberapa menit lagi.' }, { status: 429 });
  }

  if (!acc || !ok) {
    if (acc) {
      const fails = acc.failed_logins + 1;
      await supabaseAdmin
        .from('accounts')
        .update({
          failed_logins: fails >= MAX_FAILS ? 0 : fails,
          locked_until: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null,
        })
        .eq('id', acc.id);
    }
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  await supabaseAdmin.from('accounts').update({ failed_logins: 0, locked_until: null }).eq('id', acc.id);
  await createSession(acc.id);
  return NextResponse.json({ ok: true });
}
