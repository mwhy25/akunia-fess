# MENFESS

Next.js 14 (App Router) + Supabase + Tailwind. Deploy penuh ke **Netlify**
(bukan Vercel — Vercel diblokir Cloudflare-nya Saweria).

## Setup

### 1. Supabase
1. Buat project di supabase.com.
2. SQL Editor → jalankan **berurutan**:
   - `supabase/schema.sql`
   - `supabase/migration_own_auth.sql` (mengganti Supabase Auth dengan sistem akun sendiri, termasuk kolom email)
3. Project Settings → API: catat **Project URL** dan **service_role key**.

> Auth dikelola sendiri (tabel `accounts`): username + password + kode
> pemulihan. Email diminta saat daftar tapi hanya untuk data donasi Saweria,
> **bukan** untuk login/reset password.

### 2. Push ke GitHub
```bash
git init
git add -A
git commit -m "init"
git push
```
Pastikan `.env.local` tidak ikut (sudah ada di `.gitignore`).

### 3. Deploy ke Netlify
1. app.netlify.com → **Add new site → Import an existing project** → pilih repo ini.
2. Netlify otomatis mendeteksi `netlify.toml` dan memakai `@netlify/plugin-nextjs`.
   Build command dan publish directory sudah diisi lewat `netlify.toml`, tidak perlu diubah.
3. Site settings → **Environment variables**, isi:

| Variabel | Nilai |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key Supabase |
| `NEXT_PUBLIC_POST_IMAGE_BUCKET` | `post-images` |
| `PAYMENT_PROVIDER` | `saweria` |
| `SAWERIA_USER_ID` | UUID akun Saweria (lihat catatan di bawah) |

4. Deploy.

### 4. Setelah deploy
1. Daftar lewat website, **simpan kode pemulihan** yang muncul (satu-satunya
   jalan pulih kalau lupa password — tidak ada reset lewat email).
2. Jadikan diri lu admin (SQL Editor Supabase):
   ```sql
   update accounts set role = 'admin' where lower(username) = lower('usernamelu');
   ```
3. Tes bayar dengan paket termurah dulu.

## Saweria
`SAWERIA_USER_ID` adalah UUID akun (bentuknya seperti `8bd207b7-...`), sama
seperti yang dipakai di `backend.saweria.co/donations/snap/<UUID>`.

- Data donasi (nama, email, pesan) otomatis terisi dari akun user yang beli
  kredit — lihat `lib/payment/saweria.ts`.
- Saat ini yang otomatis **hanya membuat QR**. Konfirmasi bayar dilakukan
  admin: buka `/admin/orders`, cocokkan dengan mutasi di dashboard Saweria,
  lalu klik **Verifikasi lunas**.
- Belum ada cek status otomatis karena endpoint-nya belum diketahui.
- Ini memakai endpoint internal Saweria (bukan API resmi): sebelumnya
  terbukti diblokir dari IP Vercel, dan berhasil dari IP Netlify. Ini bisa
  berubah kapan saja tanpa pemberitahuan dari pihak Saweria.

## Dev lokal
```bash
npm install
cp .env.example .env.local   # isi
npm run dev
```

## Keamanan akun (buatan sendiri)
- Password di-hash **scrypt** (salt acak per akun). Sesi = token acak
  256-bit di cookie `httpOnly`; database hanya menyimpan hash-nya.
- Login dibatasi per IP (10x/15 menit); akun dikunci 15 menit setelah 5 kali
  salah berturut-turut.
- Lupa password memakai **kode pemulihan** (ditampilkan sekali saat daftar).
  Kode hangus setelah dipakai dan diganti yang baru. Kalau password DAN
  kode hilang, akun tidak bisa dipulihkan.
- Ganti password / reset otomatis mengeluarkan semua perangkat lain.
- Semua akses data lewat server (service role) dengan filter `user_id`; RLS
  tanpa policy menutup akses langsung dari luar.

## Harga paket
Ubah di satu tempat: `PACKAGES` di `lib/constants.ts`.

## Auto-post ke X (TIDAK RESMI — risiko akun dibekukan)
Menfess tayang otomatis ke X begitu user kirim, TANPA moderasi. Ini memakai
`agent-twitter-client`, library yang meniru sesi browser lewat cookie
(`auth_token` + `ct0`), BUKAN API resmi X.

**Risiko yang disadari dan diterima:**
- Melanggar Terms of Service X. Akun bisa dibekukan permanen tanpa jalur banding.
- `X_AUTH_TOKEN` setara password akun X — kalau bocor, akun bisa diambil alih.
- Cookie ini bisa kadaluarsa/dicabut X kapan saja tanpa pemberitahuan.

**Cara ambil cookie:**
1. Login ke x.com di browser (akun yang akan dipakai untuk posting menfess).
2. Buka DevTools (F12) → Application/Storage → Cookies → `https://x.com`.
3. Salin nilai cookie `auth_token` dan `ct0`, isi ke env `X_AUTH_TOKEN` dan `X_CT0`.

**Kalau auto-post gagal** (cookie kadaluarsa, dll): post TETAP tersimpan
berstatus `queued`, kredit user TIDAK hilang. Admin bisa:
- klik **"Coba posting ulang ke X"** di `/admin/posts` (setelah cookie diperbarui), atau
- klik **"Tolak"** untuk mengembalikan kredit user kalau memang tidak mau ditayangkan.

## Catatan
- Auto-post ke X aktif tanpa moderasi (lihat bagian di atas).
