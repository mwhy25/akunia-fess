'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TWEET_CHARS } from '@/lib/constants';
import { tweetLength } from '@/lib/utils';

interface Img {
  id: string;
  preview: string;
  url?: string;
  uploading: boolean;
  error?: string;
}

// Lingkaran sisa karakter ala X.
function Ring({ used }: { used: number }) {
  const left = MAX_TWEET_CHARS - used;
  const r = 12;
  const c = 2 * Math.PI * r;
  const pct = Math.min(used / MAX_TWEET_CHARS, 1);
  const color = left < 0 ? '#e10a1f' : left <= 20 ? '#ffe600' : '#f4efe9';
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <circle cx="15" cy="15" r={r} fill="none" stroke="#2a1417" strokeWidth="3" />
        <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 15 15)" />
      </svg>
      <span className="text-sm font-black tabular-nums" style={{ color }}>{left}</span>
    </div>
  );
}

export function PostForm({ credits }: { credits: number }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const used = tweetLength(text);
  const over = used > MAX_TWEET_CHARS;
  const busy = images.some((i) => i.uploading);
  const ready = images.filter((i) => i.url);
  const canSend = !!text.trim() && !over && !busy && !loading && credits > 0;

  // Tinggi textarea mengikuti isi.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(160, el.scrollHeight) + 'px';
  }, [text]);

  // Bersihkan object URL.
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError('');
    const room = MAX_IMAGES - images.length;
    const files = Array.from(list).slice(0, room);
    if (list.length > room) setError(`Maksimal ${MAX_IMAGES} gambar.`);

    for (const f of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
        setError('Hanya gambar JPG, PNG, WEBP, atau GIF. Video tidak didukung.');
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`"${f.name}" lebih dari 5 MB.`);
        continue;
      }
      const id = crypto.randomUUID();
      const item: Img = { id, preview: URL.createObjectURL(f), uploading: true };
      setImages((s) => [...s, item]);

      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Gagal upload');
        setImages((s) => s.map((x) => (x.id === id ? { ...x, url: j.url, uploading: false } : x)));
      } catch (e: any) {
        setImages((s) => s.filter((x) => x.id !== id));
        setError(e.message);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeImg(id: string) {
    setImages((s) => s.filter((x) => x.id !== id));
  }

  async function submit() {
    if (!canSend) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), images: ready.map((i) => i.url) }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.code === 'NO_CREDITS') return router.push('/credits');
        throw new Error(j.error || 'Gagal mengirim');
      }
      setDone(true);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="border-[3px] border-acid p-6 text-center">
        <p className="display text-5xl text-acid">Terkirim</p>
        <p className="mx-auto mt-3 max-w-[34ch] text-mute">Menfess lu masuk antrean. Pantau statusnya di Riwayat.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/my-posts" className="btn">Lihat riwayat</Link>
          <button className="btn btn-ghost" onClick={() => { setText(''); setImages([]); setDone(false); }}>Kirim lagi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {credits === 0 && (
        <div className="border-[3px] border-red bg-red-deep p-4">
          <p className="font-bold">Kredit lu habis.</p>
          <Link href="/credits" className="btn btn-sm mt-3">Isi kredit</Link>
        </div>
      )}

      <div className={`border-[3px] bg-panel ${over ? 'border-red' : 'border-ink'} focus-within:border-acid`}>
        <label htmlFor="content" className="sr-only">Isi menfess</label>
        <textarea
          id="content"
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Apa yang mau lu sampaikan?"
          className="block min-h-[160px] w-full resize-none bg-transparent p-4 text-lg leading-relaxed placeholder:text-mute/60 focus:outline-none"
          disabled={credits === 0}
        />

        {images.length > 0 && (
          <ul className={`grid gap-2 px-4 pb-4 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {images.map((im) => (
              <li key={im.id} className="relative aspect-video overflow-hidden border-[3px] border-line bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.preview} alt="Pratinjau gambar" className={`h-full w-full object-cover ${im.uploading ? 'opacity-40' : ''}`} />
                {im.uploading && <span className="absolute inset-0 flex items-center justify-center text-xs font-black uppercase tracking-widest">Mengunggah</span>}
                <button onClick={() => removeImg(im.id)} aria-label="Hapus gambar" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center bg-black/80 text-2xl font-black">×</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t-[3px] border-line px-3 py-1">
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" id="img" onChange={(e) => addFiles(e.target.files)} disabled={images.length >= MAX_IMAGES || credits === 0} />
            <label htmlFor="img" className={`flex min-h-[44px] cursor-pointer items-center gap-2 px-2 text-sm font-black uppercase tracking-wider ${images.length >= MAX_IMAGES ? 'text-mute/40' : 'text-acid'}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><rect x="3" y="4" width="18" height="16" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 9" /></svg>
              Gambar {images.length}/{MAX_IMAGES}
            </label>
          </div>
          <Ring used={used} />
        </div>
      </div>

      <p className="text-[13px] text-mute">Maksimal {MAX_TWEET_CHARS} karakter dan {MAX_IMAGES} gambar (5 MB per gambar). Link dihitung 23 karakter, seperti di X. Video tidak didukung.</p>

      {over && <p className="err" role="alert">Kelebihan {used - MAX_TWEET_CHARS} karakter. Pangkas dulu sebelum kirim.</p>}
      {error && <p className="err" role="alert">{error}</p>}

      <button onClick={submit} disabled={!canSend} className="btn">
        {loading ? 'Mengirim...' : busy ? 'Menunggu gambar...' : 'Kirim menfess (1 kredit)'}
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}
