'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'register' | 'forgot';

const TITLE: Record<Mode, string> = {
  login: 'Masuk',
  register: 'Daftar',
  forgot: 'Lupa password',
};

export function AuthModal({ open, mode, onMode, onClose }: {
  open: boolean;
  mode: Mode;
  onMode: (m: Mode) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  // Reset pesan saat ganti mode / buka.
  useEffect(() => {
    setError('');
    setInfo('');
    if (open) setTimeout(() => firstRef.current?.focus(), 50);
  }, [mode, open]);

  // Tutup dengan Esc + kunci scroll body.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const nextPath = () => {
    const n = params.get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const origin = window.location.origin;

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Email atau password salah.');
        router.push(nextPath());
        router.refresh();
      } else if (mode === 'register') {
        const username = String(fd.get('username') ?? '').trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
          throw new Error('Username 3–20 karakter: huruf, angka, atau underscore.');
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username }, emailRedirectTo: `${origin}/auth/callback` },
        });
        if (error) throw new Error(error.message.includes('already') ? 'Email sudah terdaftar.' : error.message);
        if (data.session) {
          router.push('/dashboard');
          router.refresh();
        } else {
          setInfo('Akun dibuat. Cek email lu dan klik link verifikasi, lalu masuk.');
          onMode('login');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/profile?reset=1`,
        });
        if (error) throw new Error(error.message);
        setInfo('Kalau email terdaftar, link reset sudah dikirim. Cek inbox dan folder spam.');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={TITLE[mode]}>
      <button aria-label="Tutup" className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto border-[3px] border-ink bg-bg pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-center justify-between border-b-[3px] border-red bg-red px-5 py-3">
          <h2 className="display text-3xl text-white">{TITLE[mode]}</h2>
          <button onClick={onClose} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center text-3xl font-black text-white">×</button>
        </div>

        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 border-b-[3px] border-line">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onMode(m)}
                className={`min-h-[52px] text-sm font-black uppercase tracking-wider ${
                  mode === m ? 'bg-ink text-bg' : 'text-mute hover:text-ink'
                }`}
              >
                {TITLE[m]}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {mode === 'register' && (
            <div>
              <label htmlFor="username" className="label">Username</label>
              <input ref={firstRef} id="username" name="username" className="field" placeholder="mis. bayangan_malam" autoComplete="username" required minLength={3} maxLength={20} />
            </div>
          )}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input ref={mode === 'register' ? undefined : firstRef} id="email" name="email" type="email" inputMode="email" className="field" placeholder="nama@email.com" autoComplete="email" required />
          </div>
          {mode !== 'forgot' && (
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" name="password" type="password" className="field" placeholder={mode === 'register' ? 'Minimal 8 karakter' : 'Password lu'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} />
            </div>
          )}

          {error && <p className="err" role="alert">{error}</p>}
          {info && <p className="ok" role="status">{info}</p>}

          <button className="btn" disabled={loading}>
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk' : mode === 'register' ? 'Buat akun' : 'Kirim link reset'}
          </button>

          <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm">
            {mode === 'login' && (
              <button type="button" onClick={() => onMode('forgot')} className="min-h-[44px] font-bold text-mute underline underline-offset-4 hover:text-ink">
                Lupa password?
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => onMode('login')} className="min-h-[44px] font-bold text-mute underline underline-offset-4 hover:text-ink">
                Kembali ke masuk
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
