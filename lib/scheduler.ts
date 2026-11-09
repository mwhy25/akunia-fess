import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Scheduler admin (tanpa kredit). Mirip lib/x.ts, tapi TIDAK memotong kredit
// dan TIDAK menulis ke tabel `posts` — hanya ke `scheduled_posts`.
//
// ATURAN (dipilih admin):
//   - WAJIB ada foto. Baris tanpa photo_url -> 'skipped' (tidak diposting).
//   - Foto gagal diunduh / bukan gambar / lebih besar dari batas backend
//     -> 'failed' (tidak diposting sebagai teks doang; bisa retry manual).
//   - Hanya SATU foto per tweet (backend Flask menerima satu field "image").

const TOTAL_BUDGET_MS = 15_000;

// Harus sama dengan MAX_FILE_SIZE di akses-otomatis-x-main/server.py (5 MB).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

// Foto dari twimg sering berukuran asli (>5 MB). Coba versi lebih kecil
// sebelum menyerah: ?name=large -> ?name=medium. (Mirip shrink_photo_url di
// xscrape/schedule.py, tapi lebih sederhana.)
function shrinkPhotoUrl(url: string): string | null {
  const next: Record<string, string> = {
    'name=orig': 'name=large',
    'name=large': 'name=medium',
    'name=medium': 'name=small',
  };
  for (const [from, to] of Object.entries(next)) {
    if (url.includes(from)) return url.replace(from, to);
  }
  return null;
}

export type ScheduledPostKind = 'posted' | 'failed' | 'skipped';

export interface SchedulerPostResult {
  kind: ScheduledPostKind;
  tweetId?: string;
  error?: string;
}

async function downloadPhoto(
  url: string,
  remaining: () => number
): Promise<{ blob: Blob; ext: string } | { error: string }> {
  let attemptUrl: string | null = url;

  for (let attempt = 0; attemptUrl && attempt < 3; attempt++) {
    let imgRes: Response;
    try {
      imgRes = await fetch(attemptUrl, {
        signal: AbortSignal.timeout(remaining()),
        cache: 'no-store',
      });
    } catch (e: any) {
      // Timeout / jaringan: tidak ada gunanya mengecilkan URL.
      return { error: `gagal unduh foto: ${e?.message ?? e}` };
    }

    if (!imgRes.ok) {
      return { error: `gagal unduh foto: HTTP ${imgRes.status}` };
    }

    const blob = await imgRes.blob();

    if (!blob.type.startsWith('image/')) {
      return { error: `URL foto bukan gambar (Content-Type: ${blob.type || 'kosong'})` };
    }

    if (blob.size > MAX_IMAGE_BYTES) {
      const smaller = shrinkPhotoUrl(attemptUrl);
      if (smaller) {
        attemptUrl = smaller;
        continue; // coba versi lebih kecil
      }
      return { error: `foto terlalu besar (${Math.round(blob.size / 1024)} KB, maks 5120 KB)` };
    }

    return { blob, ext: EXT_BY_TYPE[blob.type] ?? 'jpg' };
  }

  return { error: 'foto terlalu besar dan tidak ada versi lebih kecil' };
}

export async function postScheduledToX(
  text: string,
  photoUrl: string | null
): Promise<SchedulerPostResult> {
  // WAJIB foto: tanpa foto, jangan posting sama sekali.
  if (!photoUrl || !photoUrl.trim()) {
    return { kind: 'skipped', error: 'tidak ada foto' };
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const remaining = () => Math.max(500, deadline - Date.now());

  const photo = await downloadPhoto(photoUrl, remaining);
  if ('error' in photo) {
    return { kind: 'failed', error: photo.error };
  }

  const form = new FormData();
  form.append('text', text);
  form.append('image', photo.blob, `image.${photo.ext}`);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/post-with-image`, {
      method: 'POST',
      headers: { 'X-Secret': backendSecret() },
      cache: 'no-store',
      signal: AbortSignal.timeout(remaining()),
      body: form,
    });
  } catch (e: any) {
    // Timeout/jaringan ke backend: perlakukan sebagai gagal (bisa retry).
    return { kind: 'failed', error: `backend tidak merespons: ${e?.message ?? e}` };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return { kind: 'failed', error: json?.error || `backend HTTP ${res.status}` };
  }

  const tweetId = extractTweetId(String(json.result ?? ''));
  if (!tweetId) {
    return { kind: 'failed', error: 'tweet id tidak terbaca dari respons' };
  }

  return { kind: 'posted', tweetId };
}

// Jalankan semua post yang sudah jatuh tempo (status pending, scheduled_at <= now).
// Dipakai cron / tombol manual. Tidak memotong kredit apa pun.
export async function runDueScheduledPosts(
  trigger: 'cron' | 'admin'
): Promise<{ posted: number; failed: number; skipped: number }> {
  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < 25; i++) {
    const { data: item, error: claimErr } = (await supabaseAdmin.rpc('claim_next_due')) as any;
    if (claimErr || !item) break;

    const result = await postScheduledToX(String(item.text), item.photo_url);

    await supabaseAdmin.rpc('record_scheduled_result', {
      p_id: item.id,
      p_status: result.kind,
      p_tweet: result.tweetId ?? null,
      p_error: result.error ?? null,
    } as any);

    if (result.kind === 'posted') posted++;
    else if (result.kind === 'failed') failed++;
    else skipped++;
  }

  await supabaseAdmin.from('scheduler_logs').insert({
    trigger,
    posted,
    failed,
    skipped,
    detail:
      posted + failed + skipped > 0
        ? `${posted} posted, ${failed} failed, ${skipped} skipped`
        : 'no due items',
  } as any);

  return { posted, failed, skipped };
}
