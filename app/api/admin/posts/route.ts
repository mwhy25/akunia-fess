import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { postToX } from '@/lib/x';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), postId: z.string().uuid(), tweetUrl: z.string().url().optional() }),
  z.object({ action: z.literal('reject'), postId: z.string().uuid(), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal('retry_x'), postId: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 });
  const body = parsed.data;

  if (body.action === 'publish') {
    const { error } = await supabaseAdmin
      .from('posts')
      .update({ status: 'published', published_at: new Date().toISOString(), tweet_url: body.tweetUrl ?? null })
      .eq('id', body.postId)
      .eq('status', 'queued');
    if (error) return NextResponse.json({ error: 'Gagal' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reject') {
    const { error } = await supabaseAdmin.rpc('reject_post_with_refund', {
      p_post: body.postId,
      p_reason: body.reason,
    });
    if (error) return NextResponse.json({ error: 'Gagal' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // retry_x: coba post ulang ke X untuk menfess yang sudah lolos moderasi/kredit
  // tapi gagal auto-post sebelumnya (masih berstatus 'queued').
  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('id, content, image_urls, status')
    .eq('id', body.postId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'Post tidak ditemukan' }, { status: 404 });
  if (post.status !== 'queued') return NextResponse.json({ error: 'Post ini bukan status queued' }, { status: 400 });

  try {
    const { tweetUrl } = await postToX(post.content, post.image_urls ?? []);
    await supabaseAdmin
      .from('posts')
      .update({ status: 'published', published_at: new Date().toISOString(), tweet_url: tweetUrl })
      .eq('id', post.id)
      .eq('status', 'queued');
    return NextResponse.json({ ok: true, tweetUrl });
  } catch (e: any) {
    return NextResponse.json({ error: `Gagal posting ke X: ${e.message}` }, { status: 502 });
  }
}
