import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MAX_IMAGES, MAX_TWEET_CHARS, POST_IMAGE_BUCKET } from '@/lib/constants';
import { tweetLength } from '@/lib/utils';
import { postToX } from '@/lib/x';

const schema = z.object({
  content: z.string().trim().min(1, 'Isi pesan dulu').max(1000),
  images: z.array(z.string().url()).max(MAX_IMAGES).default([]),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.is_banned) return NextResponse.json({ error: 'Akun diblokir' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 });
  }
  const { content, images } = parsed.data;

  if (tweetLength(content) > MAX_TWEET_CHARS) {
    return NextResponse.json({ error: `Maksimal ${MAX_TWEET_CHARS} karakter` }, { status: 400 });
  }

  // Gambar hanya boleh dari bucket kita dan folder milik user ini.
  const prefix = `/storage/v1/object/public/${POST_IMAGE_BUCKET}/${user.id}/`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const okImages = images.every((u) => u.startsWith(base) && new URL(u).pathname.startsWith(prefix));
  if (!okImages) return NextResponse.json({ error: 'Gambar tidak valid' }, { status: 400 });

  // Potong kredit + simpan post sebagai 'queued' (atomic, lewat RPC).
  const { data: postId, error } = await supabaseAdmin.rpc('create_post_with_credit', {
    p_user: user.id,
    p_content: content,
    p_images: images,
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS_OR_BANNED')) {
      return NextResponse.json({ error: 'Kredit habis. Isi kredit dulu.', code: 'NO_CREDITS' }, { status: 402 });
    }
    return NextResponse.json({ error: 'Gagal mengirim' }, { status: 500 });
  }

  // Kredit sudah terpotong dan post sudah tersimpan. Sekarang coba post ke X.
  // Kalau gagal, JANGAN batalkan/refund otomatis di sini — post tetap 'queued'
  // supaya admin bisa retry manual dari /admin/posts (X kadang error sesaat,
  // bukan berarti kontennya harus ditolak).
  try {
    const { tweetUrl } = await postToX(content, images);
    await supabaseAdmin
      .from('posts')
      .update({ status: 'published', published_at: new Date().toISOString(), tweet_url: tweetUrl })
      .eq('id', postId)
      .eq('status', 'queued');
  } catch (e: any) {
    console.error('Auto-post ke X gagal:', e.message);
    // Post tetap 'queued'. Tidak melempar error ke user — kredit mereka valid,
    // menfess mereka tercatat, cuma belum tayang. Admin akan lihat di /admin/posts.
  }

  return NextResponse.json({ id: postId });
}
