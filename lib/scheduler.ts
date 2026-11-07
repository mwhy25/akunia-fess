import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Scheduler admin (tanpa kredit). Mirip lib/x.ts, tapi TIDAK memotong kredit
// dan TIDAK menulis ke tabel `posts` — hanya ke `scheduled_posts`.
// Protokol posting identik dengan xscrape/schedule.py: /post untuk teks,
// /post-with-image (multipart) kalau ada foto.

const TOTAL_BUDGET_MS = 9_000;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function baseUrl() {
  const url = process.env.X_BACKEND_URL;
  if (!url) throw new Error('X_BACKEND_URL belum di-set');
  return url.replace(/\/$/, '');
}

function backendSecret() {
  const secret = process.env.X_BACKEND_SECRET;
  if (!secret) throw new Error('X_BACKEND_SECRET belum di-set');
  return secret;
}

function extractTweetId(resultStr: string): string | null {
  return resultStr.match(/id="(\d+)"/)?.[1] ?? null;
}

interface SchedulerPostResult {
  ok: boolean;
  tweetId?: string;
  error?: string;
}

export async function postScheduledToX(text: string, photoUrl: string | null): Promise<SchedulerPostResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const remaining = () => Math.max(500, deadline - Date.now());

  let res: Response;

  if (!photoUrl) {
    res = await fetch(`${baseUrl()}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': backendSecret() },
      cache: 'no-store',
      signal: AbortSignal.timeout(remaining()),
      body: JSON.stringify({ text }),
    });
  } else {
    const imgRes = await fetch(photoUrl, { signal: AbortSignal.timeout(remaining()) });
    if (!imgRes.ok) return { ok: false, error: `gagal unduh foto: HTTP ${imgRes.status}` };
    const blob = await imgRes.blob();
    const ext = EXT_BY_TYPE[blob.type] ?? 'jpg';

    const form = new FormData();
    form.append('text', text);
    form.append('image', blob, `image.${ext}`);

    res = await fetch(`${baseUrl()}/post-with-image`, {
      method: 'POST',
      headers: { 'X-Secret': backendSecret() },
      cache: 'no-store',
      signal: AbortSignal.timeout(remaining()),
      body: form,
    });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return { ok: false, error: json?.error || `backend HTTP ${res.status}` };
  }

  const tweetId = extractTweetId(String(json.result ?? ''));
  if (!tweetId) return { ok: false, error: 'tweet id tidak terbaca dari respons' };

  return { ok: true, tweetId };
}

// Jalankan semua post yang sudah jatuh tempo (status pending, scheduled_at <= now).
// Dipakai cron / tombol manual. Tidak memotong kredit apa pun.
export async function runDueScheduledPosts(trigger: 'cron' | 'admin'): Promise<{ posted: number; failed: number; skipped: number }> {
  let posted = 0;
  let failed = 0;

  for (let i = 0; i < 25; i++) {
    const { data: item, error: claimErr } = await supabaseAdmin.rpc('claim_next_due') as any;
    if (claimErr || !item) break;

    const result = await postScheduledToX(String(item.text), item.photo_url);

    if (result.ok) {
      await supabaseAdmin.rpc('record_scheduled_result', {
        p_id: item.id,
        p_status: 'posted',
        p_tweet: result.tweetId,
        p_error: null,
      } as any);
      posted++;
    } else {
      // Batasi percobaan: 3x gagal berturut -> 'skipped' biar tidak loop selamanya.
      const attempts = Number(item.attempts ?? 0);
      const giveUp = attempts >= 3;
      await supabaseAdmin.rpc('record_scheduled_result', {
        p_id: item.id,
        p_status: giveUp ? 'failed' : 'pending',
        p_tweet: null,
        p_error: result.error ?? 'gagal',
      } as any);
      // record 'pending' mengembalikan status ke pending (retry di run berikutnya).
      if (giveUp) failed++;
    }
  }

  await supabaseAdmin.from('scheduler_logs').insert({
    trigger,
    posted,
    failed,
    skipped: 0,
    detail: posted + failed > 0 ? `${posted} posted, ${failed} failed` : 'no due items',
  } as any);

  return { posted, failed, skipped: 0 };
}
