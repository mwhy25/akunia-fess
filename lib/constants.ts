export const MAX_TWEET_CHARS = 280;
export const MAX_IMAGES = 1;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const POST_IMAGE_BUCKET = process.env.NEXT_PUBLIC_POST_IMAGE_BUCKET || 'post-images';

export type PackageId = 'tester' | 'solo' | 'reguler' | 'deluxe';

export interface CreditPackage {
  id: PackageId;
  name: string;
  amount: number; // rupiah
  credits: number;
  hot?: boolean;
}

// Satu-satunya sumber harga. Server SELALU memakai ini, bukan angka dari client.
export const PACKAGES: CreditPackage[] = [
    { id: 'tester', name: 'tester', amount: 1000, credits: 1 },
    { id: 'solo', name: 'Solo', amount: 5000, credits: 1 },
  // { id: 'starter', name: 'Starter', amount: 15000, credits: 4, hot:true },
  { id: 'reguler', name: 'Reguler', amount: 15000, credits: 4, hot: true },
  { id: 'deluxe', name: 'Deluxe', amount: 50000, credits: 13 },
];

export const getPackage = (id: string) => PACKAGES.find((p) => p.id === id);
export const ORDER_EXPIRY_MINUTES = 15;
export const MAX_PENDING_ORDERS = 3;

// Kredit awal akun baru (promo). Ubah via env INITIAL_CREDITS tanpa deploy kode.
// Fallback 5 agar promo jalan walau env belum di-set.
export const INITIAL_CREDITS = (() => {
  const raw = process.env.INITIAL_CREDITS;
  if (raw == null || raw.trim() === '') return 5;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return 5;
  return n;
})();
