export const MAX_TWEET_CHARS = 280;
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const POST_IMAGE_BUCKET = process.env.NEXT_PUBLIC_POST_IMAGE_BUCKET || 'post-images';

export type PackageId = 'starter' | 'reguler' | 'jumbo';

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
    { id: 'Solo', name: 'Solo', amount: 5000, credits: 1 },
  { id: 'Starter', name: 'Starter', amount: 15000, credits: 4, hot:true },
  // { id: 'reguler', name: 'Reguler', amount: 25000, credits: 15, hot: true },
  { id: 'Deluxe', name: 'Deluxe', amount: 100000, credits: 25 },
];

export const getPackage = (id: string) => PACKAGES.find((p) => p.id === id);
export const ORDER_EXPIRY_MINUTES = 15;
export const MAX_PENDING_ORDERS = 3;
