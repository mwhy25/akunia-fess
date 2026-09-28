import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

const schema = z.object({ orderId: z.string().uuid() });

// Verifikasi manual order (provider "manual").
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });

  const { error } = await supabaseAdmin.rpc('fulfill_order', { p_order: parsed.data.orderId, p_amount_paid: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
