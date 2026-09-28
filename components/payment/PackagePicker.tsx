'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PACKAGES, type PackageId } from '@/lib/constants';
import { rupiah } from '@/lib/utils';

export function PackagePicker() {
  const router = useRouter();
  const [selected, setSelected] = useState<PackageId>('reguler');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pkg = PACKAGES.find((p) => p.id === selected)!;

  async function pay() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selected }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal membuat pembayaran');
      router.push(`/credits/checkout/${j.orderId}`);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="sr-only">Pilih paket kredit</legend>
        <div className="grid gap-4">
          {PACKAGES.map((p) => {
            const on = p.id === selected;
            return (
              <label key={p.id} className={`relative grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-[3px] p-5 transition ${on ? 'border-acid bg-red-deep' : 'border-line bg-panel hover:border-mute'}`}>
                <input type="radio" name="pkg" value={p.id} checked={on} onChange={() => setSelected(p.id)} className="sr-only" />
                {p.hot && <span className="absolute -top-3.5 left-4 bg-acid px-2 py-1 text-[10px] font-black uppercase tracking-widest text-black">Paling laris</span>}
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-widest text-mute">{p.name}</div>
                  <div className="display mt-1 text-5xl">{p.credits}<small className="ml-1 font-sans text-base font-extrabold text-mute">kredit</small></div>
                  <div className="mt-1 text-xs font-bold text-mute">{rupiah(Math.round(p.amount / p.credits))} per menfess</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="display text-3xl">{rupiah(p.amount)}</div>
                  <span aria-hidden className={`flex h-7 w-7 items-center justify-center border-[3px] text-lg font-black leading-none ${on ? 'border-acid bg-acid text-black' : 'border-mute'}`}>{on ? '✓' : ''}</span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p className="err" role="alert">{error}</p>}

      <button onClick={pay} disabled={loading} className="btn">
        {loading ? 'Membuat pembayaran...' : `Bayar ${rupiah(pkg.amount)}`}
        <span aria-hidden>→</span>
      </button>
      <p className="text-[13px] text-mute">Pembayaran lewat QRIS. Kredit masuk otomatis setelah pembayaran terkonfirmasi.</p>
    </div>
  );
}
