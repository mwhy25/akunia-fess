import 'server-only';

// Posting ke X pakai cookie sesi (auth_token + ct0), BUKAN API resmi X.
// Ini melanggar Terms of Service X dan berisiko akun dibekukan tanpa jalur
// banding — sudah disepakati sebagai risiko yang diterima untuk project ini.
//
// Library: agent-twitter-client (community, tidak resmi, bisa berubah/rusak
// kapan saja mengikuti perubahan internal X).

export interface PostToXResult {
  tweetUrl: string;
  tweetId: string;
}

let cachedScraper: any = null;

async function getScraper() {
  if (cachedScraper) return cachedScraper;

  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;
  if (!authToken || !ct0) throw new Error('X_AUTH_TOKEN / X_CT0 belum di-set');

  const { Scraper } = await import('agent-twitter-client');
  const scraper = new Scraper();

  // Pasang cookie sesi langsung, tanpa login ulang.
  await scraper.setCookies([
    { key: 'auth_token', value: authToken, domain: '.x.com' },
    { key: 'ct0', value: ct0, domain: '.x.com' },
  ]);

  const ok = await scraper.isLoggedIn();
  if (!ok) throw new Error('Cookie X_AUTH_TOKEN/X_CT0 tidak valid atau sudah kadaluarsa');

  cachedScraper = scraper;
  return scraper;
}

// Unduh gambar dari URL publik Supabase kita, jadi Buffer untuk diunggah ke X.
async function fetchImageBuffer(url: string): Promise<{ data: Buffer; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh gambar: ${url} (HTTP ${res.status})`);
  const mediaType = res.headers.get('content-type') || 'image/jpeg';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, mediaType };
}

export async function postToX(content: string, imageUrls: string[]): Promise<PostToXResult> {
  const scraper = await getScraper();

  const media = [];
  for (const url of imageUrls.slice(0, 4)) {
    const { data, mediaType } = await fetchImageBuffer(url);
    media.push({ data, mediaType });
  }

  const result = await scraper.sendTweet(content, undefined, media);
  const json = await result.json().catch(() => null);

  const tweetId: string | undefined =
    json?.data?.create_tweet?.tweet_results?.result?.rest_id;

  if (!tweetId) {
    throw new Error(`Tidak bisa membaca tweet id dari respons: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return { tweetId, tweetUrl: `https://x.com/i/web/status/${tweetId}` };
}
