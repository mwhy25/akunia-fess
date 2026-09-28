'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { rupiah } from '@/lib/utils';

interface Order {
  id: string;
  status: 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
  credits: number;
  amount: number;
  total_paid: number | null;
  qr_image: string | null;
  qr_string: string | null;
  expires_at: string | null;
}

export function CheckoutView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Polling status tiap 3 detik selama masih pending.
  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/payment/status/${orderId}`, { cache: 'no-store' });
        if (res.status === 404) return setMissing(true);
        const data: Order = await res.json();
        if (stop) return;
        setOrder(data);
        if (data.status === 'paid') {
          router.replace(`/credits/success?orderId=${orderId}`);
          router.refresh();
          return;
        }
        if (data.status === 'pending') timer.current = setTimeout(poll, 3000);
      } catch {
        if (!stop) timer.current = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { stop = true; clearTimeout(timer.current); };
  }, [orderId, router]);

  // Hitung mundur.
  useEffect(() => {
    if (!order?.expires_at || order.status !== 'pending') return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [order?.expires_at, order?.status]);

  if (missing) {
    return (
      <div className="border-[3px] border-red p-6 text-center">
        <p className="font-bold">Order tidak ditemukan.</p>
        <Link href="/credits" className="btn btn-sm mx-auto mt-4 max-w-xs">Kembali ke kredit</Link>
      </div>
    );
  }
  if (!order) return <p className="py-10 text-center text-mute" role="status">Memuat pembayaran...</p>;

  const expired = order.status === 'expired' || (order.status === 'pending' && left === 0);
  const mm = String(Math.floor((left ?? 0) / 60)).padStart(2, '0');
  const ss = String((left ?? 0) % 60).padStart(2, '0');
  const total = order.total_paid ?? order.amount;

  if (expired || order.status === 'failed') {
    return (
      <div className="border-[3px] border-red p-6 text-center">
        <p className="display text-4xl">{order.status === 'failed' ? 'Pembayaran gagal' : 'QR kedaluwarsa'}</p>
        <p className="mt-3 text-mute">Kalau lu sudah bayar, jangan bayar lagi. Hubungi admin dengan menyebut ID order di bawah.</p>
        <p className="mt-2 break-all text-xs text-mute">ID: {order.id}</p>
        <Link href="/credits" className="btn mt-5">Buat pembayaran baru</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-[3px] border-acid bg-acid/10 px-4 py-3">
        <span className="text-sm font-bold">Selesaikan dalam</span>
        <span className="display text-3xl tabular-nums text-acid" role="timer" aria-live="off">{mm}:{ss}</span>
      </div>

      <div className="border-[3px] border-ink bg-white p-4">
        {order.qr_string ? (
          <QRCodeSVG value={order.qr_string} size={320} level="M" marginSize={2} className="mx-auto h-auto w-full max-w-[320px]" />
        ) : order.qr_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={order.qr_image} alt="Kode QRIS untuk pembayaran" className="mx-auto aspect-square w-full max-w-[320px] object-contain" />
        ) : (
          <p className="py-16 text-center font-bold text-black">QR belum tersedia. Hubungi admin dengan ID order di bawah.</p>
        )}
      </div>

      <dl className="border-[3px] border-line">
        <div className="flex justify-between border-b-[3px] border-line p-4"><dt className="text-mute">Total bayar</dt><dd className="display text-2xl">{rupiah(total)}</dd></div>
        <div className="flex justify-between p-4"><dt className="text-mute">Kredit didapat</dt><dd className="display text-2xl text-acid">+{order.credits}</dd></div>
      </dl>

      <div className="flex items-center gap-3 border-l-4 border-acid bg-panel px-4 py-3 text-sm" role="status">
        <span className="h-3 w-3 flex-none animate-pulse bg-acid" aria-hidden />
        Menunggu pembayaran. Halaman ini otomatis berpindah begitu terbayar.
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
        <li>Buka e-wallet atau m-banking apa pun yang mendukung QRIS.</li>
        <li>Scan kode di atas, pastikan nominal sesuai.</li>
        <li>Selesaikan pembayaran, tunggu beberapa detik.</li>
      </ol>
      <p className="break-all text-xs text-mute">ID order: {order.id}</p>
    </div>
  );
}
