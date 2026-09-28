import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PackagePicker } from '@/components/payment/PackagePicker';
import { StatusBadge } from '@/components/post/StatusBadge';
import { rupiah, timeAgo } from '@/lib/utils';
import Link from 'next/link';

export default async function CreditsPage() {
  const user = await requireUser();
  const supabase = createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, credits, amount, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-[clamp(44px,13vw,80px)]">Isi<br /><span className="text-red">kredit</span></h1>
        <p className="mt-3 text-mute">Sisa kredit lu sekarang: <b className="text-acid">{user.credits}</b></p>
      </div>

      <PackagePicker />

      <section>
        <h2 className="display mb-3 text-3xl">Pembelian terakhir</h2>
        {!orders?.length ? (
          <p className="border-[3px] border-dashed border-line p-5 text-center text-mute">Belum ada pembelian.</p>
        ) : (
          <ul className="border-[3px] border-line">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 border-b-[3px] border-line p-4 last:border-b-0">
                <div>
                  <p className="font-bold">+{o.credits} kredit · {rupiah(o.amount)}</p>
                  <p className="text-xs text-mute">{timeAgo(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  {o.status === 'pending' && <Link href={`/credits/checkout/${o.id}`} className="flex min-h-[44px] items-center text-sm font-black text-acid underline underline-offset-4">Lanjutkan</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
