import 'server-only';

// Posting ke X lewat backend Flask (twikit) yang dideploy terpisah di Render.
// Ini pola sama seperti Saweria dulu: proses Python di server lain, dipanggil
// lewat HTTP dari sini. Sudah terbukti sukses lewat tes manual PowerShell.
//
// BUKAN API resmi X — pakai cookie sesi (auth_token + ct0), jadi melanggar
// Terms of Service X dan berisiko akun dibekukan tanpa jalur banding. Risiko
// ini sudah disadari dan diterima untuk project ini.

export interface PostToXResult {
  tweetUrl: string;
  tweetId: string;
}

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

// Ambil id tweet dari string hasil twikit, mis: <Tweet id="2105180848622629091">
function extractTweetId(resultStr: string): string | null {
  const m = resultStr.match(/id="(\d+)"/);
  return m ? m[1] : null;
}

export async function postToX(content: string, imageUrls: string[]): Promise<PostToXResult> {
  const hasImage = imageUrls.length > 0;

  let res: Response;

  if (!hasImage) {
    // Tanpa gambar: endpoint /post, JSON biasa.
    res = await fetch(`${baseUrl()}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': backendSecret() },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ text: content }),
    });
  } else {
    // Dengan gambar: endpoint /post-with-image, multipart/form-data.
    // Backend Flask cuma menerima SATU file per field "image" (MAX_IMAGES = 1
    // di lib/constants.ts sudah membatasi ini sejak sisi user mengunggah).
    const imgRes = await fetch(imageUrls[0]);
    if (!imgRes.ok) throw new Error(`Gagal mengunduh gambar: ${imageUrls[0]}`);
    const blob = await imgRes.blob();

    const form = new FormData();
    form.append('text', content);
    form.append('image', blob, 'image.jpg');

    res = await fetch(`${baseUrl()}/post-with-image`, {
      method: 'POST',
      headers: { 'X-Secret': backendSecret() },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      body: form,
    });
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Backend X error (HTTP ${res.status})`);
  }

  const tweetId = extractTweetId(String(json.result ?? ''));
  if (!tweetId) {
    throw new Error(`Tidak bisa membaca tweet id dari respons: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return { tweetId, tweetUrl: `https://x.com/i/web/status/${tweetId}` };
}
