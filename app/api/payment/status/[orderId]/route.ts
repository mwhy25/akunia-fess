import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, credits, amount, total_paid, qr_image, qr_string, expires_at, paid_at')
    .eq('id', params.orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 });

  // Expire lazy.
  if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
    await supabaseAdmin.from('orders').update({ status: 'expired' }).eq('id', order.id).eq('status', 'pending');
    order.status = 'expired';
  }

  return NextResponse.json(order);
}
