import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkSaweriaPaid } from '@/lib/payment/saweria';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, provider, provider_ref, credits, amount, total_paid, qr_image, qr_string, expires_at, paid_at')
    .eq('id', params.orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 });

  // Expire lazy.
  if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
    await supabaseAdmin.from('orders').update({ status: 'expired' }).eq('id', order.id).eq('status', 'pending');
    order.status = 'expired';
  }

  // Saweria tidak punya webhook → kita yang menanyakan status ke Saweria.
  if (order.status === 'pending' && order.provider === 'saweria' && order.provider_ref) {
    try {
      if (await checkSaweriaPaid(order.provider_ref)) {
        // fulfill_order idempotent: aman walau terpanggil berkali-kali.
        const { error } = await supabaseAdmin.rpc('fulfill_order', { p_order: order.id, p_amount_paid: null });
        if (!error) order.status = 'paid';
        else console.error('fulfill_order gagal:', error.message);
      }
    } catch (e) {
      console.error('cek Saweria gagal:', e);
    }
  }

  // Jangan bocorkan provider_ref ke client.
  const { provider: _p, provider_ref: _r, ...safe } = order;
  return NextResponse.json(safe);
}
