import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProvider, ACTIVE_PROVIDER } from '@/lib/payment';
import { getPackage, ORDER_EXPIRY_MINUTES, MAX_PENDING_ORDERS } from '@/lib/constants';

const schema = z.object({ packageId: z.string() });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.is_banned) return NextResponse.json({ error: 'Akun diblokir' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });

  const pkg = getPackage(parsed.data.packageId);
  if (!pkg) return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 400 });

  // Bersihkan yang sudah lewat waktu, lalu batasi order pending per user.
  await supabaseAdmin.rpc('expire_orders');
  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');
  if ((count ?? 0) >= MAX_PENDING_ORDERS) {
    return NextResponse.json(
      { error: 'Masih ada pembayaran yang belum selesai. Selesaikan atau tunggu kedaluwarsa.' },
      { status: 429 }
    );
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: user.id,
      provider: ACTIVE_PROVIDER,
      package_id: pkg.id,
      amount: pkg.amount,
      credits: pkg.credits,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !order) return NextResponse.json({ error: 'Gagal membuat order' }, { status: 500 });

  try {
    const result = await getProvider().createPayment({
      orderId: order.id,
      userId: user.id,
      username: user.username,
      email: user.email!,
      amount: pkg.amount,
      description: `${pkg.credits} kredit menfess`,
      expiresInMinutes: ORDER_EXPIRY_MINUTES,
    });

    await supabaseAdmin
      .from('orders')
      .update({
        provider_ref: result.providerRef,
        qr_string: result.qrString,
        qr_image: result.qrImage,
        invoice_url: result.invoiceUrl,
        total_paid: result.totalPaid,
        expires_at: result.expiresAt,
      })
      .eq('id', order.id);

    return NextResponse.json({ orderId: order.id });
  } catch (e: any) {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'failed', metadata: { error: String(e?.message ?? e) } })
      .eq('id', order.id);
    return NextResponse.json({ error: 'Gagal membuat pembayaran' }, { status: 502 });
  }
}
