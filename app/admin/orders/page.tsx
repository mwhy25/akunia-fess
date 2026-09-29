import { supabaseAdmin } from '@/lib/supabase/admin';
import { StatusBadge } from '@/components/post/StatusBadge';
import { VerifyOrderButton, CheckSaweriaButton } from '@/components/layout/AdminActions';
import { rupiah, timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminOrders() {
  await supabaseAdmin.rpc('expire_orders');
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, status, amount, credits, provider, created_at, accounts(username)')
    .order('created_at', { ascending: false })
    .limit(60);

  return (
    <div className="space-y-5">
      <h1 className="display text-5xl">Order</h1>
      <ul className="space-y-3">
        {orders?.map((o: any) => (
          <li key={o.id} className="border-[3px] border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <StatusBadge status={o.status} />
              <span className="text-xs text-mute">{timeAgo(o.created_at)} · {o.provider}</span>
            </div>
            <p className="font-bold">{o.accounts?.username}</p>
            <p>{rupiah(o.amount)} → +{o.credits} kredit</p>
            <p className="mb-3 break-all text-xs text-mute">{o.id}</p>
            {o.provider === 'saweria' && <CheckSaweriaButton orderId={o.id} />}
            {o.status === 'pending' && <VerifyOrderButton orderId={o.id} />}
          </li>
        ))}
        {!orders?.length && <p className="text-mute">Belum ada order.</p>}
      </ul>
    </div>
  );
}