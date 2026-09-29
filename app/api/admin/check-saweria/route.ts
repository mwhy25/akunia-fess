import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkSaweriaPaidDebug } from '@/lib/payment/saweria';

const schema = z.object({ orderId: z.string().uuid() });

// Dipanggil admin untuk menanyakan LANGSUNG ke Saweria (bukan baca status di Supabase),
// lalu update database kalau ternyata sudah SUCCESS di sana.
// Mengembalikan detail mentah (debug) supaya kalau gagal, sebabnya kelihatan
// langsung di browser, bukan cuma tersembunyi di log server.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, provider')
    .eq('id', parsed.data.orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 });
  if (order.provider !== 'saweria') {
    return NextResponse.json({ error: 'Order ini bukan provider Saweria' }, { status: 400 });
  }

  const debug = await checkSaweriaPaidDebug(order.id);

  if (!debug.ok) {
    // Gagal menghubungi Saweria (token invalid, network, dll) — tampilkan apa adanya.
    return NextResponse.json({ ok: false, paid: false, message: debug.error, debug }, { status: 502 });
  }

  if (!debug.paid) {
    return NextResponse.json({
      ok: true,
      paid: false,
      message: `Belum ditemukan transaksi SUCCESS yang cocok. Dicari: "${debug.orderIdDicari}". Ada ${debug.jumlahTransaksi} transaksi terbaru, lihat debug untuk detail.`,
      debug,
    });
  }

  // Sudah SUCCESS di Saweria. Kalau di DB masih pending/expired, luluskan sekarang.
  if (order.status !== 'paid') {
    await supabaseAdmin.from('orders').update({ status: 'pending' }).eq('id', order.id).neq('status', 'paid');
    const { error } = await supabaseAdmin.rpc('fulfill_order', { p_order: order.id, p_amount_paid: null });
    if (error) {
      return NextResponse.json({ ok: false, paid: true, message: `Ditemukan SUCCESS tapi gagal fulfill: ${error.message}`, debug }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, paid: true, message: 'Terkonfirmasi SUCCESS di Saweria. Kredit sudah masuk.', debug });
}
