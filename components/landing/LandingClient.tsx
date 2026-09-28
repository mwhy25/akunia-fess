'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthModal } from '@/components/auth/AuthModal';
import { PACKAGES } from '@/lib/constants';
import { rupiah } from '@/lib/utils';

type Mode = 'login' | 'register' | 'forgot';

const FAQ = [
  ['Beneran anonim?', 'Akun Twitter kami yang posting. Nama dan email lu tidak pernah ditampilkan ke publik.'],
  ['Berapa lama sampai tayang?', 'Pesan masuk antrean dan diposting setelah dicek. Status bisa lu pantau di halaman Riwayat.'],
  ['Kalau pesan gue ditolak?', 'Kredit dikembalikan otomatis, dan lu bisa kirim ulang versi yang sudah diperbaiki.'],
  ['Bayarnya pakai apa?', 'QRIS, jadi bisa lewat e-wallet atau m-banking apa pun.'],
  ['Bisa kirim gambar?', 'Bisa, sampai 4 gambar per menfess. Video belum didukung.'],
  ['Batas panjang pesan?', '280 karakter, sama seperti batas tweet di X.'],
];

const RULES = [
  'Doxxing dan menyebar data pribadi orang lain.',
  'Ujaran kebencian, ancaman, atau pelecehan.',
  'Konten seksual eksplisit dan konten yang melibatkan anak.',
  'Spam dan iklan terselubung.',
];

export function LandingClient({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [showSticky, setShowSticky] = useState(false);
  const heroCta = useRef<HTMLButtonElement>(null);

  // Buka modal otomatis dari ?auth=login|register (redirect middleware).
  useEffect(() => {
    const a = params.get('auth');
    if (a === 'login' || a === 'register') {
      setMode(a);
      setOpen(true);
    }
  }, [params]);

  const openAuth = useCallback((m: Mode) => {
    if (loggedIn) return router.push('/dashboard');
    setMode(m);
    setOpen(true);
  }, [loggedIn, router]);

  const close = useCallback(() => {
    setOpen(false);
    if (params.get('auth')) router.replace('/', { scroll: false });
  }, [params, router]);

  useEffect(() => {
    const el = heroCta.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ticker = ['Tanpa nama', 'Tanpa ribet', 'Anonim 100%', 'Langsung antre'];

  return (
    <>
      <header className="sticky top-0 z-30 border-b-[3px] border-red bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <a href="#" className="display bg-red px-2.5 pb-1 pt-1.5 text-[26px] text-white" aria-label="Menfess">MENFESS</a>
          <button onClick={() => openAuth('login')} className="min-h-[44px] px-1 text-sm font-black uppercase tracking-wider">
            {loggedIn ? 'Dashboard' : 'Masuk'}
          </button>
        </div>
      </header>

      <div className="overflow-hidden whitespace-nowrap border-b-[3px] border-black bg-acid text-xs font-black uppercase tracking-[0.14em] text-black" aria-hidden="true">
        <div className="ticker-track inline-block py-2.5">
          {[...Array(4)].flatMap((_, i) => ticker.map((t) => <span key={`${i}-${t}`} className="mx-4">{t} ★</span>))}
        </div>
      </div>

      <main>
        {/* HERO */}
        <div className="border-b-[3px] border-line py-10">
          <div className="mx-auto max-w-3xl px-5">
            <h1 className="display text-[clamp(64px,21vw,150px)]">
              Kirim<br />pesan.<br />
              <span className="inline-block bg-red px-[0.08em] text-white">Tanpa<br />nama.</span>
            </h1>
            <p className="mt-6 max-w-[30ch] text-lg text-mute">
              Yang gak bisa lu bilang langsung, <b className="text-ink">bilang di sini</b>. Kami yang posting.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button ref={heroCta} onClick={() => openAuth('register')} className="btn">{loggedIn ? 'Ke dashboard' : 'Mulai kirim'}<span aria-hidden>→</span></button>
              <a href="#cara" className="btn btn-ghost">Cara kerja<span aria-hidden>↓</span></a>
            </div>
          </div>
        </div>

        {/* CARA KERJA */}
        <section id="cara" className="border-b-[3px] border-line py-12">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display mb-7 text-[clamp(44px,13vw,88px)]">Cara<br /><span className="text-red">kerja</span></h2>
            <ol className="border-[3px] border-ink">
              {[
                ['Daftar', 'Bikin akun pakai email. Cuma butuh semenit.', 'bg-red text-white'],
                ['Isi kredit', 'Bayar lewat QRIS. Satu kredit untuk satu menfess.', 'bg-acid text-black'],
                ['Kirim', 'Tulis pesan, tambah gambar kalau perlu, lalu kirim.', 'bg-ink text-black'],
              ].map(([t, d, c], i) => (
                <li key={t} className="grid grid-cols-[76px_1fr] border-b-[3px] border-ink last:border-b-0">
                  <div className={`display flex items-center justify-center text-5xl ${c}`}>{i + 1}</div>
                  <div className="bg-panel p-4">
                    <h3 className="display mb-1.5 text-2xl">{t}</h3>
                    <p className="text-[15px] text-mute">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* HARGA */}
        <section id="harga" className="border-b-[3px] border-line py-12">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display mb-7 text-[clamp(44px,13vw,88px)]">Pilih<br /><span className="text-red">paket</span></h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {PACKAGES.map((p) => (
                <div key={p.id} className={`relative grid grid-cols-[1fr_auto] items-center gap-2 border-[3px] p-5 sm:grid-cols-1 ${p.hot ? 'border-red bg-red-deep' : 'border-line bg-panel'}`}>
                  {p.hot && <span className="absolute -top-3.5 left-4 bg-acid px-2 py-1 text-[10px] font-black uppercase tracking-widest text-black">Paling laris</span>}
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-widest text-mute">{p.name}</div>
                    <div className="display mt-1 text-5xl">{p.credits}<small className="ml-1 font-sans text-base font-extrabold text-mute">kredit</small></div>
                  </div>
                  <div className="text-right sm:text-left">
                    <div className="display text-2xl">{rupiah(p.amount)}</div>
                    <div className="mt-1 text-[11px] font-bold text-mute">{rupiah(Math.round(p.amount / p.credits))} / post</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[13px] text-mute">Kredit tidak punya masa kedaluwarsa.</p>
          </div>
        </section>

        {/* ATURAN */}
        <section className="border-b-[3px] border-line py-12">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display mb-7 text-[clamp(44px,13vw,88px)]">Yang<br /><span className="text-red">dilarang</span></h2>
            <ul>
              {RULES.map((r) => (
                <li key={r} className="flex gap-3.5 border-b-2 border-line py-4 last:border-b-0">
                  <span className="w-5 flex-none text-xl font-black leading-tight text-red" aria-hidden>✕</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] text-mute">Pesan yang melanggar ditolak dan kreditnya dikembalikan.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-b-[3px] border-line py-12">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display mb-7 text-[clamp(44px,13vw,88px)]">Sering<br /><span className="text-red">ditanya</span></h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-b-2 border-line">
                <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[17px] font-extrabold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="flex-none text-3xl font-black text-red group-open:hidden" aria-hidden>+</span>
                  <span className="hidden flex-none text-3xl font-black text-red group-open:inline" aria-hidden>–</span>
                </summary>
                <p className="max-w-[46ch] pb-5 text-[15px] text-mute">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA AKHIR */}
        <section className="bg-red py-14">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display text-[clamp(56px,18vw,120px)] text-white">Ada yang<br />mau lu<br />bilang?</h2>
            <p className="mb-6 mt-4 max-w-[28ch] text-[17px] text-[#ffd6da]">Mulai sekarang, gak perlu sebut nama.</p>
            <button onClick={() => openAuth('register')} className="btn !border-black !bg-black text-white hover:!border-white hover:!bg-white hover:!text-black">
              {loggedIn ? 'Ke dashboard' : 'Daftar dan kirim'}<span aria-hidden>→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-24 pt-7 text-xs text-mute sm:pb-10">
        <div className="flex flex-wrap justify-between gap-3">
          <span>© {new Date().getFullYear()} MENFESS</span>
          <span>Konten menjadi tanggung jawab pengirim.</span>
        </div>
      </footer>

      {/* CTA sticky khusus mobile */}
      <div className={`fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3 transition-transform duration-200 sm:hidden ${showSticky && !open ? 'translate-y-0' : 'translate-y-[120%]'}`}>
        <button onClick={() => openAuth('register')} className="btn" tabIndex={showSticky ? 0 : -1}>{loggedIn ? 'Ke dashboard' : 'Mulai kirim'}<span aria-hidden>→</span></button>
      </div>

      <AuthModal open={open} mode={mode} onMode={setMode} onClose={close} />
    </>
  );
}
