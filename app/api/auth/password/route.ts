import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashSecret, verifySecret } from '@/lib/security/password';
import { createSession, destroyAllSessions } from '@/lib/security/session';

const schema = z.object({
  current: z.string().min(1).max(128),
  next: z.string().min(8, 'Password baru minimal 8 karakter.').max(128),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 });

  const { data: acc } = await supabaseAdmin.from('accounts').select('password_hash').eq('id', user.id).single();
  if (!acc || !(await verifySecret(parsed.data.current, acc.password_hash))) {
    return NextResponse.json({ error: 'Password saat ini salah.' }, { status: 403 });
  }

  await supabaseAdmin.from('accounts').update({ password_hash: await hashSecret(parsed.data.next) }).eq('id', user.id);
  await destroyAllSessions(user.id); // perangkat lain keluar
  await createSession(user.id);      // perangkat ini tetap masuk
  return NextResponse.json({ ok: true });
}
