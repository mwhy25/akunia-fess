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

export function CheckSaweriaButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function check() {
    setLoading(true);
    setResult(null);
    const res = await fetch('/api/admin/check-saweria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    setResult({ httpOk: res.ok, ...j });
    if (j.paid) router.refresh();
  }

  return (
    <div>
      <button onClick={check} disabled={loading} className="btn btn-sm btn-ghost">
        {loading ? 'Mengecek ke Saweria...' : 'Cek ke Saweria'}
      </button>

      {result && (
        <div className={`mt-2 space-y-2 border-l-4 p-3 text-sm ${result.paid ? 'border-acid bg-acid/10' : 'border-red bg-red-deep/40'}`}>
          <p className="font-bold">{result.message || result.error || 'Tidak ada respons'}</p>

          {result.debug && (
            <details className="text-xs text-mute">
              <summary className="cursor-pointer font-bold text-ink">Lihat detail mentah (debug)</summary>
              <div className="mt-2 space-y-1">
                <p>token di-set: {String(result.debug.tokenSet)}</p>
                <p>HTTP status Saweria: {String(result.debug.httpStatus)}</p>
                <p>dicari: <span className="break-all font-mono">{result.debug.orderIdDicari}</span></p>
                <p>jumlah transaksi terbaru: {String(result.debug.jumlahTransaksi)}</p>
                {result.debug.transaksiTerbaru?.length > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="font-bold text-ink">5 transaksi terbaru dari Saweria:</p>
                    {result.debug.transaksiTerbaru.map((t: any, i: number) => (
                      <p key={i} className="break-all border-t border-line pt-1 font-mono">
                        [{t.status}] Rp{t.amount} · {t.created_at}<br />
                        message: "{t.message}"
                        {t.message?.trim() === result.debug.orderIdDicari?.trim() && <span className="text-acid"> ← COCOK</span>}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
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
