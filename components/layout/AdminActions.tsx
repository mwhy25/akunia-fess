'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VerifyOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function verify() {
    if (!confirm('Tandai order ini LUNAS dan tambahkan kredit ke user?')) return;
    setLoading(true); setError('');
    const res = await fetch('/api/admin/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
    setLoading(false);
    if (!res.ok) return setError((await res.json()).error || 'Gagal');
    router.refresh();
  }

  return (
    <div>
      <button onClick={verify} disabled={loading} className="btn btn-sm">{loading ? 'Memproses...' : 'Verifikasi lunas'}</button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

export function ModeratePostButtons({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function act(body: object) {
    setLoading(true); setError('');
    const res = await fetch('/api/admin/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setLoading(false);
    if (!res.ok) return setError((await res.json()).error || 'Gagal');
    router.refresh();
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button
        disabled={loading}
        className="btn btn-sm"
        onClick={() => {
          const url = prompt('Link tweet (opsional, kosongkan jika belum ada):')?.trim();
          if (url === undefined) return;
          act({ action: 'publish', postId, ...(url ? { tweetUrl: url } : {}) });
        }}
      >
        Tandai tayang
      </button>
      <button
        disabled={loading}
        className="btn btn-sm btn-ghost"
        onClick={() => {
          const reason = prompt('Alasan penolakan (kredit akan dikembalikan):')?.trim();
          if (reason && reason.length >= 3) act({ action: 'reject', postId, reason });
        }}
      >
        Tolak + refund
      </button>
      {error && <p className="err sm:col-span-2">{error}</p>}
    </div>
  );
}
