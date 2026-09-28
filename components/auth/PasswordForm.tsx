'use client';
import { useState } from 'react';

export function PasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setOk('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const current = String(fd.get('current') ?? '');
    const next = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    if (next.length < 8) return setError('Password baru minimal 8 karakter.');
    if (next !== confirm) return setError('Konfirmasi password tidak sama.');

    setLoading(true);
    const res = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }) });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(j.error || 'Gagal mengganti password.');
    setOk('Password diganti. Perangkat lain otomatis keluar.');
    form.reset();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border-[3px] border-line p-5">
      <h2 className="display text-2xl">Ganti password</h2>
      <div>
        <label htmlFor="current" className="label">Password saat ini</label>
        <input id="current" name="current" type="password" className="field" autoComplete="current-password" required />
      </div>
      <div>
        <label htmlFor="password" className="label">Password baru</label>
        <input id="password" name="password" type="password" className="field" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Ulangi password baru</label>
        <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}
      <button className="btn" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan password'}</button>
    </form>
  );
}
