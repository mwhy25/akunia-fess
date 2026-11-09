import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runDueScheduledPosts, postScheduledToX } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

function requireAdminGate(user: Awaited<ReturnType<typeof getUser>>) {
  return user && user.role === 'admin';
}

// ------------------------------------------------------------
// GET — daftar scheduled_posts + log eksekusi terakhir
// ------------------------------------------------------------
export async function GET() {
  const user = await getUser();
  if (!requireAdminGate(user)) return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const { data: posts, error: pErr } = await supabaseAdmin
    .from('scheduled_posts')
    .select('*')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(500);

  const { data: logs, error: lErr } = await supabaseAdmin
    .from('scheduler_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(20);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  return NextResponse.json({ posts: posts ?? [], logs: logs ?? [] });
}

// ------------------------------------------------------------
// POST — beberapa aksi:
//   { action: 'import', rows: [...] }  -> simpan antrian dari xlsx/csv
//   { action: 'run' }                  -> jalankan semua yang due sekarang
//   { action: 'post-now', id }         -> post 1 item sekarang
//   { action: 'skip', id }             -> tandai skip
//   { action: 'delete', id }          -> hapus 1 item
//   { action: 'clear-failed' }        -> hapus semua failed/skipped
// ------------------------------------------------------------
const importRowSchema = z.object({
  source_ref: z.string().max(80).optional().nullable(),
  text: z.string().min(1).max(1000),
  photo_url: z.string().url().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  meta: z.record(z.any()).optional(),
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('import'), rows: z.array(importRowSchema).min(1).max(2000) }),
  z.object({ action: z.literal('run') }),
  z.object({ action: z.literal('post-now'), id: z.string().uuid() }),
  z.object({ action: z.literal('skip'), id: z.string().uuid() }),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('clear-failed') }),
  z.object({ action: z.literal('retry-failed') }),
]);

export async function POST(req: Request) {
  const user = await getUser();
  if (!requireAdminGate(user)) return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Data tidak valid', detail: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  switch (body.action) {
    case 'import': {
      // Dedup: kalau source_ref sudah ada, perbarui (UPSERT).
      const rows = body.rows.map((r) => ({
        source_ref: r.source_ref ?? null,
        text: r.text,
        photo_url: r.photo_url ?? null,
        scheduled_at: r.scheduled_at ?? null,
        status: 'pending',
        attempts: 0,
        meta: r.meta ?? {},
        created_by: user!.username,
      }));

      // Upsert per-baris via upsert + onConflict hanya jika source_ref unik.
      const { error } = await supabaseAdmin
        .from('scheduled_posts')
        .upsert(rows as any, { onConflict: 'source_ref', ignoreDuplicates: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true, imported: rows.length });
    }

    case 'run': {
      const res = await runDueScheduledPosts('admin');
      return NextResponse.json({ ok: true, ...res });
    }

    case 'post-now': {
      const { data: item, error: qErr } = await supabaseAdmin
        .from('scheduled_posts')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
      if (!item) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 });

      // Post manual: aturan sama seperti cron (wajib foto, foto gagal = failed).
      const result = await postScheduledToX(String(item.text), item.photo_url);

      const { error } = await supabaseAdmin.rpc('record_scheduled_result', {
        p_id: item.id,
        p_status: result.kind,
        p_tweet: result.tweetId ?? null,
        p_error: result.error ?? null,
      } as any);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        ok: result.kind === 'posted',
        kind: result.kind,
        tweetId: result.tweetId ?? null,
        error: result.error ?? null,
      });
    }

    case 'skip': {
      const { error } = await supabaseAdmin
        .from('scheduled_posts')
        .update({ status: 'skipped', last_error: 'manual skip' })
        .eq('id', body.id)
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      const { error } = await supabaseAdmin.from('scheduled_posts').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'clear-failed': {
      const { error, count } = await supabaseAdmin
        .from('scheduled_posts')
        .delete({ count: 'exact' })
        .in('status', ['failed', 'skipped']);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, removed: count ?? 0 });
    }

    case 'retry-failed': {
      const { count: before } = await supabaseAdmin
        .from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed');
      const { error } = await supabaseAdmin
        .from('scheduled_posts')
        .update({ status: 'pending', attempts: 0, last_error: null })
        .eq('status', 'failed');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, retried: before ?? 0 });
    }
  }
}
