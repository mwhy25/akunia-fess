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
      qrString: d.qr_string,
      totalPaid: amount,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    };
  },

  async verifyWebhook() {
    return { valid: false };
  },
};

// Hasil detail untuk keperluan debug — dipakai oleh endpoint admin supaya
// error/isi mentah kelihatan di browser, bukan cuma tersembunyi di log server.
export interface SaweriaCheckDebug {
  ok: boolean;
  paid: boolean;
  httpStatus?: number;
  tokenSet: boolean;
  orderIdDicari: string;
  jumlahTransaksi?: number;
  transaksiTerbaru?: { status: string; amount: number; message: string; created_at: string }[];
  error?: string;
}

export async function checkSaweriaPaidDebug(orderId: string): Promise<SaweriaCheckDebug> {
  const token = process.env.SAWERIA_TOKEN;
  const tokenSet = !!token;

  if (!token) {
    return { ok: false, paid: false, tokenSet: false, orderIdDicari: orderId, error: 'SAWERIA_TOKEN belum di-set di environment variables.' };
  }

  let res: Response;
  try {
    res = await fetch('https://backend.saweria.co/transactions?page=1&page_size=20', {
      headers: {
        Authorization: token,
        Referer: 'https://saweria.co/',
        Origin: 'https://saweria.co',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: any) {
    return { ok: false, paid: false, tokenSet, orderIdDicari: orderId, error: `fetch gagal: ${e.message}` };
  }

  if (res.status === 401) {
    return { ok: false, paid: false, httpStatus: 401, tokenSet, orderIdDicari: orderId, error: 'Token ditolak Saweria (401) — kemungkinan sudah kadaluarsa, login ulang di saweria.co.' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, paid: false, httpStatus: res.status, tokenSet, orderIdDicari: orderId, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, paid: false, httpStatus: res.status, tokenSet, orderIdDicari: orderId, error: 'Respons bukan JSON yang valid.' };
  }

  const transactions: any[] = body?.data?.transactions ?? [];
  const found = transactions.find(
    (t) => t.status === 'SUCCESS' && typeof t.message === 'string' && t.message.trim() === orderId.trim()
  );

  return {
    ok: true,
    paid: !!found,
    httpStatus: res.status,
    tokenSet,
    orderIdDicari: orderId,
    jumlahTransaksi: transactions.length,
    // Kirim 5 transaksi teratas biar kelihatan di browser, buat dibandingkan manual.
    transaksiTerbaru: transactions.slice(0, 5).map((t) => ({
      status: t.status,
      amount: t.amount,
      message: t.message,
      created_at: t.created_at,
    })),
  };
}

// Dipakai oleh alur otomatis (polling checkout) — versi ringkas, tanpa detail.
export async function checkSaweriaPaid(orderId: string): Promise<boolean> {
  const result = await checkSaweriaPaidDebug(orderId);
  return result.paid;
}
