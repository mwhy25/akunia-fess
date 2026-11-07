import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkSaweriaPaid } from '@/lib/payment/saweria';

export const dynamic = 'force-dynamic';

// Jangan panggil Saweria tiap polling client (3 detik). Satu order cukup
// dicek maksimal sekali per 20 detik — hemat request & hindari rate limit.
const CHECK_INTERVAL_MS = 20_000;

export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, provider, credits, amount, total_paid, qr_image, qr_string, expires_at, paid_at, last_checked_at')
    .eq('id', params.orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 });

  const lastChecked = order.last_checked_at ? new Date(order.last_checked_at).getTime() : 0;
  const dueForCheck = Date.now() - lastChecked >= CHECK_INTERVAL_MS;

  // Cek pembayaran DULUAN, sebelum menandai kedaluwarsa — kalau user sudah bayar
  // walau QR-nya sudah lewat waktu tampil, kredit tetap harus masuk.
  // Order yang sudah 'expired' tetap dicek selama masih < 24 jam.
  const recentlyExpired =
    order.status === 'expired' &&
    !!order.expires_at &&
    new Date(order.expires_at).getTime() > Date.now() - 24 * 60 * 60_000;
  const canCheck = order.status === 'pending' || recentlyExpired;

  if (canCheck && order.provider === 'saweria' && dueForCheck) {
    // Tandai lebih dulu supaya request paralel tidak ikut menembak Saweria.
    await supabaseAdmin
      .from('orders')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', order.id);

    try {
      if (await checkSaweriaPaid(order.id)) {
        const { error } = await supabaseAdmin.rpc('fulfill_order', { p_order: order.id, p_amount_paid: null });
        if (!error) order.status = 'paid';
        else console.error('fulfill_order gagal:', error.message);
      }
    } catch (e) {
      console.error('cek saweria gagal:', e);
    }
  }

  // Baru sekarang cek kedaluwarsa, kalau ternyata belum ketahuan lunas di atas.
  if (order.status === 'pending' && order.expires_at && new Date(order.expires_at) < new Date()) {
    await supabaseAdmin.from('orders').update({ status: 'expired' }).eq('id', order.id).eq('status', 'pending');
    order.status = 'expired';
  }

  return NextResponse.json(order);
}
