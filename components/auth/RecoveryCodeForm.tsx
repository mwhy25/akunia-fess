'use client';
import { useState } from 'react';

export function RecoveryCodeForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const current = String(new FormData(form).get('current') ?? '');
    if (!current) return setError('Isi password lu dulu.');

    setLoading(true);
    const res = await fetch('/api/auth/recovery/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(j.error || 'Gagal membuat kode baru.');
    setCode(j.recoveryCode);
    form.reset();
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard bisa diblokir — user masih bisa salin manual */
    }
  }

  if (code) {
    return (
      <div className="space-y-4 border-[3px] border-acid p-5">
        <h2 className="display text-2xl">Kode pemulihan baru</h2>
        <p className="text-[15px]">
          Kode lama sudah tidak berlaku. <b className="text-acid">Kode ini hanya tampil sekali.</b>
        </p>
        <div className="select-all break-all border-[3px] border-acid bg-acid/10 p-4 text-center font-mono text-2xl font-black tracking-wider text-acid" aria-live="polite">
          {code}
        </div>
        <button type="button" onClick={copy} className="btn btn-ghost">{copied ? 'Tersalin ✓' : 'Salin kode'}</button>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[#ffe600]" />
          <span>Gue sudah menyimpan kode ini di tempat aman.</span>
        </label>
        <button type="button" disabled={!saved} onClick={() => { setCode(null); setCopied(false); setSaved(false); }} className="btn">
          Selesai
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border-[3px] border-line p-5">
      <h2 className="display text-2xl">Kode pemulihan</h2>
      <p className="text-sm text-mute">
        Kode pemulihan adalah satu-satunya cara masuk lagi kalau lupa password.
        Buat kode baru kalau kode lama hilang atau bocor — kode lama langsung hangus.
      </p>
      <div>
        <label htmlFor="recovery-current" className="label">Password saat ini</label>
        <input id="recovery-current" name="current" type="password" className="field" autoComplete="current-password" required />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" disabled={loading}>{loading ? 'Membuat...' : 'Buat kode pemulihan baru'}</button>
    </form>
  );
}
