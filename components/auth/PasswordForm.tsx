'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function PasswordForm({ highlight }: { highlight?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setOk('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const pw = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    if (pw.length < 8) return setError('Password minimal 8 karakter.');
    if (pw !== confirm) return setError('Konfirmasi password tidak sama.');

    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return setError(error.message);
    setOk('Password berhasil diganti.');
    form.reset();
  }

  return (
    <form onSubmit={onSubmit} className={`space-y-4 border-[3px] p-5 ${highlight ? 'border-acid' : 'border-line'}`}>
      <h2 className="display text-2xl">{highlight ? 'Atur password baru' : 'Ganti password'}</h2>
      <div>
        <label htmlFor="password" className="label">Password baru</label>
        <input id="password" name="password" type="password" className="field" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Ulangi password</label>
        <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" minLength={8} required />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}
      <button className="btn" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan password'}</button>
    </form>
  );
}
