import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const count = async (table: string, col?: string, val?: string) => {
    let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
    if (col && val) q = q.eq(col, val);
    return (await q).count ?? 0;
  };
  const [queued, pending, users, published] = await Promise.all([
    count('posts', 'status', 'queued'),
    count('orders', 'status', 'pending'),
    count('accounts'),
    count('posts', 'status', 'published'),
  ]);

  const cards = [
    ['Antrean post', queued, '/admin/posts', queued > 0],
    ['Order menunggu', pending, '/admin/orders', pending > 0],
    ['Total user', users, null, false],
    ['Post tayang', published, null, false],
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="display text-5xl">Ringkasan</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([label, n, href, hot]) => {
          const body = (
            <div className={`border-[3px] p-4 ${hot ? 'border-acid bg-acid/10' : 'border-line bg-panel'}`}>
              <p className="display text-5xl">{n}</p>
              <p className="mt-1 text-sm text-mute">{label}</p>
            </div>
          );
          return href ? <Link key={label} href={href}>{body}</Link> : <div key={label}>{body}</div>;
        })}
      </div>
    </div>
  );
}
