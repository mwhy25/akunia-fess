'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'login' | 'register' | 'forgot';

const TITLE: Record<Mode, string> = { login: 'Masuk', register: 'Daftar', forgot: 'Lupa password' };

async function post(url: string, body: object) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Terjadi kesalahan. Coba lagi.');
  return json;
}

export function AuthModal({ open, mode, onMode, onClose }: {
  open: boolean;
  mode: Mode;
  onMode: (m: Mode) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Setelah daftar / reset: tampilkan kode pemulihan SEKALI.
  const [recovery, setRecovery] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError('');
    if (open && !recovery) setTimeout(() => firstRef.current?.focus(), 50);
  }, [mode, open, recovery]);

  useEffect(() => {
    if (!open) { setRecovery(null); setSaved(false); setCopied(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Selama kode pemulihan tampil, Esc tidak boleh menutup (agar tidak hilang tanpa disalin).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !recovery && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose, recovery]);

  if (!open) return null;

  const nextPath = () => {
    const n = params.get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');

    try {
      if (mode === 'login') {
        await post('/api/auth/login', { username, password });
        router.push(nextPath());
        router.refresh();
      } else if (mode === 'register') {
        const confirm = String(fd.get('confirm') ?? '');
        if (password !== confirm) throw new Error('Konfirmasi password tidak sama.');
        const r = await post('/api/auth/register', { username, email, password });
        setRecovery(r.recoveryCode);
      } else {
        const code = String(fd.get('code') ?? '');
        const r = await post('/api/auth/recover', { username, recoveryCode: code, newPassword: password });
        setRecovery(r.recoveryCode);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!recovery) return;
    try { await navigator.clipboard.writeText(recovery); setCopied(true); } catch { /* abaikan */ }
  }

  function finish() {
    router.push(nextPath());
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={TITLE[mode]}>
      <button aria-label="Tutup" className="absolute inset-0 bg-black/80" onClick={() => !recovery && onClose()} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto border-[3px] border-ink bg-bg pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-center justify-between border-b-[3px] border-red bg-red px-5 py-3">
          <h2 className="display text-3xl text-white">{recovery ? 'Simpan kode ini' : TITLE[mode]}</h2>
          {!recovery && <button onClick={onClose} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center text-3xl font-black text-white">×</button>}
        </div>

        {recovery ? (
          <div className="space-y-4 p-5">
            <p className="text-[15px]">
              Ini <b>kode pemulihan</b> lu. Satu-satunya cara masuk lagi kalau lupa password &mdash; email tidak dipakai untuk reset.
              <b className="text-acid"> Kode ini hanya tampil sekali.</b>
            </p>
            <div className="select-all break-all border-[3px] border-acid bg-acid/10 p-4 text-center font-mono text-2xl font-black tracking-wider text-acid" aria-live="polite">
              {recovery}
            </div>
            <button type="button" onClick={copy} className="btn btn-ghost">{copied ? 'Tersalin ✓' : 'Salin kode'}</button>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[#ffe600]" />
              <span>Gue sudah menyimpan kode ini di tempat aman (catatan, password manager, atau screenshot).</span>
            </label>
            <button type="button" disabled={!saved} onClick={finish} className="btn">Lanjut</button>
          </div>
        ) : (
          <>
            {mode !== 'forgot' && (
              <div className="grid grid-cols-2 border-b-[3px] border-line">
                {(['login', 'register'] as const).map((m) => (
                  <button key={m} onClick={() => onMode(m)} className={`min-h-[52px] text-sm font-black uppercase tracking-wider ${mode === m ? 'bg-ink text-bg' : 'text-mute hover:text-ink'}`}>
                    {TITLE[m]}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div>
                <label htmlFor="username" className="label">Username</label>
                <input ref={firstRef} id="username" name="username" className="field" placeholder="mis. bayangan_malam" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={20} />
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="email" className="label">Email</label>
                  <input id="email" name="email" type="email" inputMode="email" className="field" placeholder="nama@email.com" autoComplete="email" required maxLength={254} />
                </div>
              )}

              {mode === 'forgot' && (
                <div>
                  <label htmlFor="code" className="label">Kode pemulihan</label>
                  <input id="code" name="code" className="field font-mono uppercase" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" required />
                </div>
              )}

              <div>
                <label htmlFor="password" className="label">{mode === 'forgot' ? 'Password baru' : 'Password'}</label>
                <input id="password" name="password" type="password" className="field" placeholder={mode === 'login' ? 'Password lu' : 'Minimal 8 karakter'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} maxLength={128} />
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="confirm" className="label">Ulangi password</label>
                  <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" required minLength={8} maxLength={128} />
                </div>
              )}

              {mode === 'register' && (
                <p className="text-[13px] text-mute">Email dipakai untuk data pembayaran, bukan untuk login. Setelah daftar, lu dapat kode pemulihan untuk jaga-jaga kalau lupa password.</p>
              )}

              {error && <p className="err" role="alert">{error}</p>}

              <button className="btn" disabled={loading}>
                {loading ? 'Memproses...' : mode === 'login' ? 'Masuk' : mode === 'register' ? 'Buat akun' : 'Reset password'}
              </button>

              <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm">
                {mode === 'login' && (
                  <button type="button" onClick={() => onMode('forgot')} className="min-h-[44px] font-bold text-mute underline underline-offset-4 hover:text-ink">Lupa password?</button>
                )}
                {mode === 'forgot' && (
                  <button type="button" onClick={() => onMode('login')} className="min-h-[44px] font-bold text-mute underline underline-offset-4 hover:text-ink">Kembali ke masuk</button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
