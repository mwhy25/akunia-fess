import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({
  usernames: z.array(z.string().min(1)).min(1).max(100),
  credits: z.number().int().min(1).max(10000),
  note: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 });
  }

  // accept usernames as string (comma/newline separated) or array — normalize here
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
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid', detail: parsed.error.flatten() }, { status: 400 });

  const rawNames = parsed.data.usernames.map((s) => s.trim()).filter(Boolean);
  // dedup case-insensitive, keep first casing for display
  const lowerMap = new Map<string, string>();
  for (const n of rawNames) {
    const k = n.toLowerCase();
    if (!lowerMap.has(k)) lowerMap.set(k, n);
  }
  const lowers = Array.from(lowerMap.keys());
  const creditsToAdd = parsed.data.credits;
  const note = parsed.data.note?.trim() || null;

  const { data: accounts, error: qErr } = await supabaseAdmin
    .from('accounts')
    .select('id, username, credits')
    .in('username', lowers as any);

  // fallback: query case-insensitive via lower()
  // Supabase PostgREST doesn't support lower() in `in`, so filter manually if needed
  let found = accounts ?? [];
  // If no results, try fetching all and filtering lower (for usernames with different casing)
  if (found.length !== lowers.length) {
    // fetch by ilike per name if still missing — simpler: fetch candidates with or
    const { data: all } = await supabaseAdmin.from('accounts').select('id, username, credits');
    const byLower = new Map((all ?? []).map((a: any) => [String(a.username).toLowerCase(), a]));
    found = lowers.map((k) => byLower.get(k)).filter(Boolean) as any;
    // keep also any that were already matched but not in map
    if (accounts?.length) {
      const seen = new Set(found.map((a: any) => a.id));
      for (const a of accounts) if (!seen.has(a.id)) found.push(a as any);
    }
  }

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const foundLower = new Set(found.map((a: any) => String(a.username).toLowerCase()));
  const notFound = lowers.filter((k) => !foundLower.has(k)).map((k) => lowerMap.get(k)!);

  const succeeded: { username: string; before: number; after: number }[] = [];
  const failed: { username: string; reason: string }[] = [];

  for (const acc of found) {
    const before = (acc as any).credits as number;
    const after = before + creditsToAdd;

    const { error: updErr } = await supabaseAdmin
      .from('accounts')
      .update({ credits: after } as any)
      .eq('id', (acc as any).id);

    if (updErr) {
      failed.push({ username: (acc as any).username, reason: updErr.message });
      continue;
    }

    const { error: insErr } = await supabaseAdmin.from('credit_transactions').insert({
      user_id: (acc as any).id,
      amount: creditsToAdd,
      type: 'admin',
      note: note ? `[manual] ${note} (nominal Rp0)` : '[manual] topup admin (nominal Rp0)',
    } as any);

    if (insErr) {
      // rollback credits if ledger fails
      await supabaseAdmin.from('accounts').update({ credits: before } as any).eq('id', (acc as any).id);
      failed.push({ username: (acc as any).username, reason: insErr.message });
      continue;
    }

    // also create a paid order with nominal 0 so it appears in daftar transaksi/order
    // orders.amount has CHECK (amount > 0) in schema.sql — insert 0 will fail until migration is applied.
    // we keep the insert but ignore constraint error so credit topup tetap berhasil.
    const { error: ordErr } = await supabaseAdmin.from('orders').insert({
      user_id: (acc as any).id,
      provider: 'manual',
      provider_ref: `admin_${Date.now()}_${(acc as any).id.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`,
      package_id: 'admin_topup',
      amount: 0,
      total_paid: 0,
      credits: creditsToAdd,
      status: 'paid',
      paid_at: new Date().toISOString(),
      metadata: { note: note ?? null, by: user.username, nominal: 0 } as any,
    } as any);
    if (ordErr) {
      // biarkan kredit tetap sukses; beri hint jika constraint belum dilonggarkan
      // eslint-disable-next-line no-console
      console.warn('[admin credits] order insert skipped:', ordErr.message);
    }

    succeeded.push({ username: (acc as any).username, before, after });
  }

  return NextResponse.json({ ok: true, succeeded, notFound, failed, creditsAdded: creditsToAdd });
}
