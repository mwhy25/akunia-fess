import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  usernames: z.array(z.string().min(1)).min(1).max(100),
  credits: z.number().int().min(1).max(10000),
  note: z.string().max(200).optional().nullable(),
});

// Username hanya boleh huruf/angka/underscore (lihat constraint DB).
const NAME_RE = /^[a-zA-Z0-9_]{1,50}$/;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 });
  }

  // Terima string (dipisah koma/baris baru) atau array.
  if (body && typeof body === 'object' && 'usernames' in body) {
    const raw = (body as any).usernames;
    if (typeof raw === 'string') {
      (body as any).usernames = raw
        .split(/[\n,;]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Data tidak valid', detail: parsed.error.flatten() }, { status: 400 });
  }

  const rawNames = parsed.data.usernames.map((s) => s.trim()).filter(Boolean);
  // Dedup case-insensitive, pertahankan ejaan pertama untuk tampilan.
  const lowerMap = new Map<string, string>();
  for (const n of rawNames) {
    const k = n.toLowerCase();
    if (!lowerMap.has(k)) lowerMap.set(k, n);
  }
  const lowers = Array.from(lowerMap.keys());
  const creditsToAdd = parsed.data.credits;
  const note = parsed.data.note?.trim() || null;

  const notFound: string[] = [];
  const failed: { username: string; reason: string }[] = [];

  const validLowers = lowers.filter((n) => {
    if (NAME_RE.test(n)) return true;
    failed.push({ username: lowerMap.get(n)!, reason: 'Format username tidak valid' });
    return false;
  });

  // Cari akun dengan ilike (case-insensitive) tanpa membaca seluruh tabel.
  const filter = validLowers.map((n) => `username.ilike.${n}`).join(',');
  const { data: accounts, error: qErr } = filter
    ? await supabaseAdmin.from('accounts').select('id, username, credits').or(filter)
    : { data: [], error: null } as any;

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const byLower = new Map<string, any>(
    (accounts ?? []).map((a: any) => [String(a.username).toLowerCase(), a])
  );

  for (const k of validLowers) {
    if (!byLower.has(k)) notFound.push(lowerMap.get(k)!);
  }

  const succeeded: { username: string; before: number; after: number }[] = [];

  for (const acc of Array.from(byLower.values())) {
    const before = Number(acc.credits);

    // Atomic: tambah kredit + catat ledger dalam satu transaksi.
    const { data: after, error: addErr } = await supabaseAdmin.rpc('add_credits', {
      p_user: acc.id,
      p_credits: creditsToAdd,
      p_note: note ? `[manual] ${note}` : '[manual] topup admin',
      p_by: user.username,
    } as any);

    if (addErr) {
      failed.push({ username: acc.username, reason: addErr.message });
      continue;
    }

    // Order Rp0 agar topup ikut tampil di /admin/orders. Non-fatal.
    const { error: ordErr } = await supabaseAdmin.from('orders').insert({
      user_id: acc.id,
      provider: 'manual',
      provider_ref: `admin_${Date.now()}_${acc.id.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`,
      package_id: 'admin_topup',
      amount: 0,
      total_paid: 0,
      credits: creditsToAdd,
      status: 'paid',
      paid_at: new Date().toISOString(),
      metadata: { note: note ?? null, by: user.username, nominal: 0 },
    } as any);
    if (ordErr) console.warn('[admin credits] order insert skipped:', ordErr.message);

    succeeded.push({ username: acc.username, before, after: Number(after) });
  }

  return NextResponse.json({ ok: true, succeeded, notFound, failed, creditsAdded: creditsToAdd });
}
