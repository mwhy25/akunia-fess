import 'server-only';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';

// scrypt (bawaan Node): N=2^15 cukup kuat dan masih muat di serverless.
const KEYLEN = 64;
const OPTS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(secret.normalize('NFKC'), salt, KEYLEN, OPTS, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(secret, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await derive(secret, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Hash biasa untuk token sesi (token sudah acak 256-bit, tidak perlu scrypt).
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Hash "palsu" untuk menyamakan waktu respons saat username tidak ada (cegah user enumeration).
export const DUMMY_HASH =
  '00000000000000000000000000000000:' + '0'.repeat(128);

// Kode pemulihan: 5 blok x 4 karakter, tanpa karakter yang mudah tertukar (0/O, 1/I/L).
// Pakai rejection sampling agar tiap karakter berpeluang sama (tanpa bias modulo).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 karakter
export function generateRecoveryCode(): string {
  const limit = 256 - (256 % ALPHABET.length); // buang byte >= 248
  const chars: string[] = [];
  while (chars.length < 20) {
    const buf = randomBytes(32);
    for (let i = 0; i < buf.length && chars.length < 20; i++) {
      const b: number = buf[i];
      if (b < limit) chars.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

export const normalizeRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
