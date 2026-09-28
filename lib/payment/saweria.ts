import type { PaymentProvider } from './types';

// Fungsi Python di /api/saweria (satu project Vercel yang sama).
// Di Vercel pakai URL deployment sendiri; lokal pakai SAWERIA_SERVICE_URL (lihat README).
function baseUrl() {
  if (process.env.SAWERIA_SERVICE_URL) return process.env.SAWERIA_SERVICE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function call(body: object) {
  const res = await fetch(`${baseUrl()}/api/saweria`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret': process.env.SAWERIA_SERVICE_SECRET!,
      // Lewati Deployment Protection Vercel untuk panggilan internal (opsional).
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Saweria service ${res.status}`);
  return json;
}

export const saweriaProvider: PaymentProvider = {
  name: 'saweria',

  async createPayment({ orderId, amount, expiresInMinutes }) {
    const r = await call({ action: 'create', amount, message: orderId });
    return {
      providerRef: r.transaction_id,
      qrString: r.qr_string, // QR digambar di browser
      totalPaid: amount,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    };
  },

  // Saweria tidak punya webhook; status dicek lewat checkSaweriaPaid().
  async verifyWebhook() {
    return { valid: false };
  },
};

export async function checkSaweriaPaid(transactionId: string): Promise<boolean> {
  const r = await call({ action: 'status', transaction_id: transactionId });
  return r.paid === true;
}
