import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/payment';

export async function POST(req: Request) {
  const result = await getProvider().verifyWebhook(req);
  if (!result.valid) return NextResponse.json({ error: 'Invalid' }, { status: 401 });

  let orderId = result.orderId;
  if (!orderId && result.providerRef) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('provider_ref', result.providerRef)
      .maybeSingle();
    orderId = data?.id;
  }
  if (!orderId) return NextResponse.json({ ok: true }); // idempotent: tidak dikenal → diabaikan

  // Satu transaksi SQL: status + kredit + ledger + validasi nominal.
  const { error } = await supabaseAdmin.rpc('fulfill_order', {
    p_order: orderId,
    p_amount_paid: result.amountPaid ?? null,
  });
  if (error) {
    console.error('fulfill_order gagal', error.message);
    return NextResponse.json({ error: 'Gagal memproses' }, { status: 500 }); // provider akan retry
  }
  return NextResponse.json({ ok: true });
}
