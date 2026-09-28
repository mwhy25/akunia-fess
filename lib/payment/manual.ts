import type { PaymentProvider } from './types';

// Mode manual: user transfer/QRIS statis, admin menekan "Verifikasi" di /admin/orders.
// Isi QRIS_STATIC_IMAGE dengan URL gambar QRIS statis milik kamu.
export const manualProvider: PaymentProvider = {
  name: 'manual',
  async createPayment({ orderId, amount, expiresInMinutes }) {
    return {
      providerRef: `manual_${orderId}`,
      qrImage: process.env.NEXT_PUBLIC_QRIS_STATIC_IMAGE || undefined,
      totalPaid: amount,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    };
  },
  async verifyWebhook() {
    // Manual tidak punya webhook; verifikasi dilakukan admin.
    return { valid: false };
  },
};
