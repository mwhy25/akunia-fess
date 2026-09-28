import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/post/StatusBadge';
import { timeAgo } from '@/lib/utils';

export default async function Dashboard() {
  const user = await requireUser();
  const supabase = createClient();

  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, status, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  const { count: total } = await supabase.from('posts').select('id', { count: 'exact', head: true });
  const empty = user.credits === 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-mute">Halo,</p>
        <h1 className="display text-[clamp(40px,12vw,72px)] break-all">{user.username}</h1>
      </div>

      <div className={`border-[3px] p-5 ${empty ? 'border-red bg-red-deep' : 'border-ink bg-panel'}`}>
        <p className="text-sm font-bold text-mute">Sisa kredit</p>
        <p className="display mt-1 text-7xl">{user.credits}</p>
        <p className="mt-2 text-sm text-mute">{empty ? 'Kredit habis. Isi dulu sebelum kirim.' : `${user.credits} menfess lagi bisa dikirim.`}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {empty ? (
            <Link href="/credits" className="btn">Isi kredit<span aria-hidden>→</span></Link>
          ) : (
            <>
              <Link href="/create" className="btn">Tulis menfess<span aria-hidden>→</span></Link>
              <Link href="/credits" className="btn btn-ghost">Tambah kredit</Link>
            </>
          )}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="display text-3xl">Terakhir dikirim</h2>
          {(total ?? 0) > 3 && <Link href="/my-posts" className="min-h-[44px] py-3 text-sm font-bold underline underline-offset-4">Lihat semua ({total})</Link>}
        </div>

        {!posts?.length ? (
          <div className="border-[3px] border-dashed border-line p-6 text-center">
            <p className="text-mute">Belum ada menfess. Yang pertama selalu paling berat, tapi lu bisa mulai sekarang.</p>
            <Link href="/create" className="btn btn-sm mx-auto mt-4 max-w-xs">Tulis menfess pertama</Link>
          </div>
        ) : (
          <ul className="border-[3px] border-line">
            {posts.map((p) => (
              <li key={p.id} className="border-b-[3px] border-line p-4 last:border-b-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-mute">{timeAgo(p.created_at)}</span>
                </div>
                <p className="line-clamp-2 break-words">{p.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
