import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkSaweriaPaid } from '@/lib/payment/saweria';

export const dynamic = 'force-dynamic';

// Pembersihan + rekonsiliasi berkala. Panggil dari cron eksternal
// (Netlify scheduled function / GitHub Actions / cron-job.org) dengan header:
//   Authorization: Bearer <CRON_SECRET>
//
// Kenapa perlu: pembayaran Saweria tidak punya webhook. Kalau user menutup tab
// checkout tepat setelah membayar, tidak ada yang memanggil fulfill_order —
// job ini yang menyelamatkan kreditnya.
const RECONCILE_MAX = 10;
const RECONCILE_AFTER_MS = 2 * 60_000; // beri waktu 2 menit setelah order dibuat

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET belum di-set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Dilarang' }, { status: 401 });
  }

  // 1) Bersihkan sesi kedaluwarsa, catatan percobaan lama, order lewat waktu.
  const { error: cleanupErr } = await supabaseAdmin.rpc('cleanup_auth');
  const { data: expired, error: expireErr } = await supabaseAdmin.rpc('expire_orders');

  if (cleanupErr || expireErr) {
    return NextResponse.json({ error: cleanupErr?.message ?? expireErr?.message }, { status: 500 });
  }

  // 2) Rekonsiliasi order Saweria yang belum lunas (maks 10 per run).
  //    Termasuk yang sudah "expired" — pembayaran telat tetap harus masuk.
  let fulfilled = 0;
  let checked = 0;
  const { data: pending } = await supabaseAdmin
    .from('orders')
    .select('id')
    .in('status', ['pending', 'expired'])
    .eq('provider', 'saweria')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .lt('created_at', new Date(Date.now() - RECONCILE_AFTER_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(RECONCILE_MAX);

  for (const o of pending ?? []) {
    checked++;
    try {
      if (await checkSaweriaPaid(o.id)) {
        const { error } = await supabaseAdmin.rpc('fulfill_order', {
          p_order: o.id,
          p_amount_paid: null,
        });
        if (!error) fulfilled++;
        else console.error('[cron] fulfill_order gagal:', error.message);
      }
      await supabaseAdmin
        .from('orders')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('id', o.id);
    } catch (e: any) {
      console.error('[cron] cek saweria gagal:', e?.message ?? e);
    }
  }

  return NextResponse.json({
    ok: true,
    expiredOrders: expired ?? 0,
    saweriaChecked: checked,
    saweriaFulfilled: fulfilled,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
