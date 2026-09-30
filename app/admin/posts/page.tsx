import { supabaseAdmin } from '@/lib/supabase/admin';
import { StatusBadge } from '@/components/post/StatusBadge';
import { RetryXButton, ModeratePostButtons } from '@/components/layout/AdminActions';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Auto-post ke X jalan otomatis begitu user kirim (tanpa moderasi dulu).
// Post yang statusnya 'queued' di sini artinya AUTO-POST GAGAL (bukan
// "menunggu disetujui") — kredit user sudah terpotong, tinggal coba tayangkan
// ulang atau tolak (kredit dikembalikan).
export default async function AdminPosts() {
  const { data: posts } = await supabaseAdmin
    .from('posts')
    .select('id, content, image_urls, status, reject_reason, tweet_url, created_at')
    .in('status', ['queued', 'rejected', 'published'])
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(60);

  return (
    <div className="space-y-5">
      <h1 className="display text-5xl">Post</h1>
      <p className="text-sm text-mute">
        Menfess tayang otomatis ke X begitu dikirim. Status <b>queued</b> di
        sini berarti auto-post gagal — kredit user sudah terpotong.
      </p>
      <ul className="space-y-3">
        {posts?.map((p) => (
          <li key={p.id} className="border-[3px] border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <StatusBadge status={p.status} />
              <span className="text-xs text-mute">{timeAgo(p.created_at)}</span>
            </div>
            <p className="mb-3 whitespace-pre-wrap break-words">{p.content}</p>
            {p.image_urls?.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {p.image_urls.map((u: string) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Lampiran post" className="aspect-video w-full border-[3px] border-line object-cover" /></a>
                ))}
              </div>
            )}
            {p.status === 'rejected' && <p className="text-sm text-mute">Alasan: {p.reject_reason}</p>}
            {p.status === 'published' && p.tweet_url && (
              <a href={p.tweet_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-acid underline underline-offset-4">Lihat di X</a>
            )}
            {p.status === 'queued' && (
              <div className="space-y-2">
                <RetryXButton postId={p.id} />
                <ModeratePostButtons postId={p.id} />
              </div>
            )}
          </li>
        ))}
        {!posts?.length && <p className="text-mute">Tidak ada post yang perlu ditangani.</p>}
      </ul>
    </div>
  );
}
