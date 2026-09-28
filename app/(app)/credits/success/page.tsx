import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function Success({ searchParams }: { searchParams: { orderId?: string } }) {
  const user = await requireUser();

  let credits: number | null = null;
  if (searchParams.orderId) {
    const { data } = await supabaseAdmin.from('orders').select('credits, status').eq('id', searchParams.orderId).eq('user_id', user.id).maybeSingle();
    if (data?.status === 'paid') credits = data.credits;
  }

  return (
    <div className="space-y-6 text-center">
      <p className="display text-[clamp(56px,18vw,110px)] text-acid">Lunas</p>
      {credits && <p className="text-lg">+{credits} kredit sudah masuk.</p>}
      <p className="text-mute">Sisa kredit lu sekarang <b className="text-ink">{user.credits}</b>.</p>
      <div className="mx-auto grid max-w-sm gap-3">
        <Link href="/create" className="btn">Tulis menfess<span aria-hidden>→</span></Link>
        <Link href="/dashboard" className="btn btn-ghost">Ke beranda</Link>
      </div>
    </div>
  );
}
