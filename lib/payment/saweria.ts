import type { PaymentProvider } from './types';

// Dipanggil langsung dari sini karena seluruh app (termasuk route API ini)
// berjalan sebagai Netlify Function, yang IP-nya sudah terbukti tidak
// diblokir Cloudflare-nya Saweria (berbeda dari IP Vercel yang diblokir).
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://saweria.co/',
  Origin: 'https://saweria.co',
  'Content-Type': 'application/json',
};

export const saweriaProvider: PaymentProvider = {
  name: 'saweria',

  async createPayment({ orderId, username, email, amount, expiresInMinutes }) {
    const userIdSaweria = process.env.SAWERIA_USER_ID;
    if (!userIdSaweria) throw new Error('SAWERIA_USER_ID belum di-set');

    const res = await fetch(`https://backend.saweria.co/donations/snap/${userIdSaweria}`, {
      method: 'POST',
      headers: HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        agree: true,
        notUnderage: true,
        // Pesan HANYA berisi order id (UUID penuh), dipakai untuk mencocokkan
        // transaksi Saweria dengan order kita saat admin/otomatis mengecek status.
        message: orderId,
        amount,
        payment_type: 'qris',
        vote: '',
        currency: 'IDR',
        customer_info: { first_name: username, email, phone: '' },
      }),
    });

    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Saweria membalas non-JSON (HTTP ${res.status}): ${text.slice(0, 150)}`);
    }
    if (!res.ok) throw new Error(`Saweria HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);

    const d = body.data ?? body;
    if (!d.qr_string || !d.id) {
      throw new Error(`Respons Saweria tidak berisi qr_string/id: ${JSON.stringify(body).slice(0, 200)}`);
    }

    return {
      providerRef: String(d.id),
      qrString: d.qr_string, // digambar di browser oleh CheckoutView
      totalPaid: amount,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    };
  },

  // Belum ada webhook asli dari Saweria. Verifikasi dilakukan admin di /admin/orders,
  // baik manual maupun lewat tombol "Cek ke Saweria" (checkSaweriaPaid di bawah).
  async verifyWebhook() {
    return { valid: false };
  },
};

// SEMENTARA untuk uji coba: token manual dari env (SAWERIA_TOKEN), berlaku ~3 hari
// lalu harus diganti manual (login ulang di saweria.co, ambil token baru, update env).
// orderId di sini HARUS UUID order PENUH (sama persis dengan yang ditulis sebagai
// message saat createPayment), bukan potongan/slice.
export async function checkSaweriaPaid(orderId: string): Promise<boolean> {
  const token = process.env.SAWERIA_TOKEN;
  if (!token) return false;

  const res = await fetch('https://backend.saweria.co/transactions?page=1&page_size=20', {
    headers: {
      Authorization: token,
      Referer: 'https://saweria.co/',
      Origin: 'https://saweria.co',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error('cek transaksi Saweria gagal:', res.status);
    return false;
  }

  const body = await res.json();
  const found = (body?.data?.transactions ?? []).find(
    (t: any) => t.status === 'SUCCESS' && typeof t.message === 'string' && t.message.trim() === orderId
  );
  return !!found;
}
