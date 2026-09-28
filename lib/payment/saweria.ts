import type { PaymentProvider } from './types';

// Memanggil endpoint Saweria langsung (tanpa Python / library pihak ketiga).
// SAWERIA_USER_ID = UUID akun Saweria lu (bukan username). Lihat README.
const USER_ID = () => process.env.SAWERIA_USER_ID!;

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

  async createPayment({ orderId, amount, expiresInMinutes }) {
    if (!process.env.SAWERIA_USER_ID) throw new Error('SAWERIA_USER_ID belum di-set');

    const res = await fetch(`https://backend.saweria.co/donations/snap/${USER_ID()}`, {
      method: 'POST',
      headers: HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        agree: true,
        notUnderage: true,
        message: `order ${orderId.slice(0, 8)}`,
        amount,
        payment_type: 'qris',
        vote: '',
        currency: 'IDR',
        customer_info: { first_name: 'Menfess', email: 'noreply@menfess.app', phone: '' },
      }),
    });

    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      // Sering terjadi kalau diblokir (halaman HTML Cloudflare, dll).
      throw new Error(`Saweria membalas non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}`);
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

  // Belum ada cek status otomatis. Verifikasi dilakukan admin di /admin/orders.
  async verifyWebhook() {
    return { valid: false };
  },
};
