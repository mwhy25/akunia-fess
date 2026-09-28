import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { StatusBadge } from '@/components/post/StatusBadge';
import { timeAgo } from '@/lib/utils';

export default async function MyPosts() {
  await requireUser();
  const supabase = createClient();
  const { data: posts } = await supabase
    .from('posts')
    .select('id, content, image_urls, status, reject_reason, tweet_url, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <h1 className="display text-[clamp(44px,13vw,80px)]">Riwayat<br /><span className="text-red">menfess</span></h1>

      {!posts?.length ? (
        <div className="border-[3px] border-dashed border-line p-8 text-center">
          <p className="text-mute">Belum ada menfess yang dikirim.</p>
          <Link href="/create" className="btn btn-sm mx-auto mt-4 max-w-xs">Tulis menfess</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="border-[3px] border-line bg-panel p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <StatusBadge status={p.status} />
                <span className="text-xs text-mute">{timeAgo(p.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{p.content}</p>
              {p.image_urls?.length > 0 && <p className="mt-2 text-xs text-mute">{p.image_urls.length} gambar terlampir</p>}
              {p.status === 'rejected' && (
                <p className="err">Ditolak: {p.reject_reason || 'melanggar aturan'}. 1 kredit sudah dikembalikan.</p>
              )}
              {p.status === 'published' && p.tweet_url && (
                <a href={p.tweet_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-black text-acid underline underline-offset-4">Lihat di X</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
