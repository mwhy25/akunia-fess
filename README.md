# MENFESS

Next.js 14 (App Router) + Supabase + Tailwind. Deploy penuh ke **Netlify**
(bukan Vercel — Vercel diblokir Cloudflare-nya Saweria).

## Setup

### 1. Supabase
1. Buat project di supabase.com.
2. SQL Editor → jalankan **berurutan**:
   - `supabase/schema.sql`
   - `supabase/migration_own_auth.sql` (mengganti Supabase Auth dengan sistem akun sendiri, termasuk kolom email)
   - `supabase/migration_2025_fixes.sql` (perbaikan: order Rp0, batas panjang post, idempotensi kirim, RPC `add_credits`, throttle cek Saweria)
   - `supabase/scheduler.sql` (fitur scheduler admin tanpa kredit: tabel `scheduled_posts` + `scheduler_logs` + RPC `claim_next_due`/`record_scheduled_result`)
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
| `NEXT_PUBLIC_SITE_URL` | URL publik situs, mis. `https://menfess-lu.com` |
| `NEXT_PUBLIC_POST_IMAGE_BUCKET` | `post-images` |
| `INITIAL_CREDITS` | kredit bonus akun baru (default `5`, `0` = mati) |
| `PAYMENT_PROVIDER` | `saweria` atau `manual` |
| `SAWERIA_USER_ID` | UUID akun Saweria (lihat catatan di bawah) |
| `SAWERIA_TOKEN` | token sesi saweria.co (untuk cek status otomatis) |
| `NEXT_PUBLIC_QRIS_STATIC_IMAGE` | (khusus `manual`) URL gambar QRIS statis |
| `X_BACKEND_URL` | URL backend Flask/twikit |
| `X_BACKEND_SECRET` | secret header `X-Secret` (WAJIB, harus sama dengan backend) |
| `CRON_SECRET` | secret untuk `/api/cron/cleanup` |

> Daftar lengkap ada di `.env.example`.

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
- QR dibuat otomatis. Status pembayaran dicek otomatis saat halaman checkout
  terbuka (maksimal sekali per 20 detik per order, supaya tidak kena rate limit).
- Kalau user menutup tab sebelum kredit masuk, buka `/admin/orders` lalu klik
  **Cek ke Saweria** untuk memverifikasi manual.
- Auto-check memakai `SAWERIA_TOKEN` (token sesi saweria.co). Kalau token
  kadaluarsa, endpoint akan melaporkan 401 — login ulang lalu ganti nilainya.
- Ini memakai endpoint internal Saweria (bukan API resmi): sebelumnya
  terbukti diblokir dari IP Vercel, dan berhasil dari IP Netlify. Ini bisa
  berubah kapan saja tanpa pemberitahuan dari pihak Saweria.

## Dev lokal
```bash
npm install
cp .env.example .env.local   # isi
npm run dev
```

Cek sebelum push:
```bash
npm run typecheck
npm run lint
npm run build
```

## Maintenance (cron)
`/api/cron/cleanup` menghapus sesi kedaluwarsa, catatan percobaan login lama,
dan menandai order pending yang sudah lewat waktu. Panggil berkala (mis. tiap
jam) dengan header:

```
Authorization: Bearer $CRON_SECRET
```

`/api/cron/scheduler` menjalankan antrian scheduler admin yang sudah jatuh
tempo (baca bagian "Scheduler admin" di bawah). Panggil lebih sering, mis.
tiap **5 menit**, supaya jadwal posting akurat.

Contoh: Netlify Scheduled Function, GitHub Actions `schedule`, atau cron-job.org.
Tanpa cron, tabel `sessions` / `auth_attempts` akan tumbuh terus.

## Scheduler admin (tanpa kredit)
Fitur internal untuk **admin sendiri**: impor antrian post dari
`index.xlsx` (hasil xscrape) lalu posting terjadwal ke X lewat backend
Flask/twikit. **TIDAK memotong kredit user** — tidak lewat RPC
`create_post_with_credit`, tidak menulis ke tabel `posts`, tidak ada order
pembayaran. Semua akses lewat `requireAdmin()` + service_role.

Halaman: **`/admin/scheduler`** (menu "Scheduler" di nav admin).

1. **Impor**: upload `index.xlsx` → kolom yang dibaca `post_id`, `text`,
   `photo_url`, `date`, `author`. Set jumlah per hari + window posting
   (mis. `09:00–22:00`). Baris di-upsert ke tabel `scheduled_posts`
   (dedup via `source_ref` = `post_id`).
2. **Wajib foto**: setiap post harus punya `photo_url`. Baris tanpa foto
   ditandai `skipped` dan **tidak diposting**. Kalau foto gagal diunduh,
   bukan gambar, atau >5 MB (batas backend), item ditandai `failed` dan
   **tidak** diposting sebagai teks doang. Hanya **satu** foto per tweet;
   kalau sel berisi beberapa URL (` | `), diambil yang pertama.
3. **Jadwal otomatis**: tiap baris dapat `scheduled_at` yang di-spread
   merata di dalam window per hari.
4. **Posting**: dua cara
   - otomatis — cron `/api/cron/scheduler` tiap beberapa menit memanggil
     RPC `claim_next_due` (atomic, `for update skip locked`) lalu
     `postScheduledToX` (`/post-with-image` multipart, protokol sama
     dengan `schedule.py`). Hasil dicatat di `record_scheduled_result`.
   - manual — tombol **"Jalan due"** / **"Post sekarang"** di halaman
     scheduler.
5. **Gagal**: item yang gagal ditandai `failed`. Tombol **"Retry failed"**
   mereset ke `pending`, **"Bersihkan"** menghapus `failed` + `skipped`.
6. Semua eksekusi tercatat di `scheduler_logs` (kolom `trigger` =
   `cron` / `admin`).

> Scheduler ini bersifat opsional. Kalau tidak mau dipakai, cukup abaikan
> halamannya — tidak ada efek ke menfess publik.

## Keamanan akun (buatan sendiri)
- Password di-hash **scrypt** (salt acak per akun). Sesi = token acak
  256-bit di cookie `httpOnly`; database hanya menyimpan hash-nya.
- Login dibatasi per IP (10 percobaan **gagal**/15 menit); akun dikunci 15
  menit setelah 5 kali salah berturut-turut. Login yang berhasil tidak
  memakan kuota. Username seperti `admin`/`support` tidak bisa didaftarkan.
- Lupa password memakai **kode pemulihan** (ditampilkan sekali saat daftar).
  Kode hangus setelah dipakai dan diganti yang baru. Kalau password DAN
  kode hilang, akun tidak bisa dipulihkan.
- Kode pemulihan bisa dibuat ulang kapan saja di `/profile` (wajib isi
  password saat ini); kode lama langsung hangus.
- Ganti password / reset otomatis mengeluarkan semua perangkat lain.
- Semua akses data lewat server (service role) dengan filter `user_id`; RLS
  tanpa policy menutup akses langsung dari luar.

## Harga paket
Ubah di satu tempat: `PACKAGES` di `lib/constants.ts`.

## Auto-post ke X (TIDAK RESMI — risiko akun dibekukan)
Menfess tayang otomatis ke X begitu user kirim, TANPA moderasi. Postingnya
dilakukan lewat **backend Python terpisah** (Flask + `twikit`), dideploy
sendiri (mis. di Render), dipanggil lewat HTTP dari `lib/x.ts`.

**Risiko yang disadari dan diterima:**
- Melanggar Terms of Service X. Akun bisa dibekukan permanen tanpa jalur banding.
- Cookie `auth_token`/`ct0` yang dipakai backend itu setara password akun X.
- Cookie ini bisa kadaluarsa/dicabut X kapan saja tanpa pemberitahuan.

**Setup:**
1. Backend Python (`server.py`, Flask + twikit) di-deploy terpisah, tidak di
   repo ini. Env `X_AUTH_TOKEN` dan `X_CT0` (cookie sesi X) ada DI BACKEND
   ITU, bukan di project Next.js ini.
2. Di project ini (Netlify), isi env:
   ```
   X_BACKEND_URL=https://nama-backend.onrender.com
   ```
3. `lib/x.ts` memanggil `${X_BACKEND_URL}/post` (tanpa gambar) atau
   `${X_BACKEND_URL}/post-with-image` (dengan gambar, multipart/form-data,
   backend saat ini hanya menerima satu gambar per tweet).

**Kalau auto-post gagal** (cookie kadaluarsa, backend down, dll): post TETAP
tersimpan berstatus `queued`, kredit user TIDAK hilang. Admin bisa:
- klik **"Coba posting ulang ke X"** di `/admin/posts` (setelah backend/cookie
  diperbaiki), atau
- klik **"Tolak"** untuk mengembalikan kredit user.

**Catatan keamanan:** backend Render itu sebaiknya membatasi siapa yang boleh
memanggilnya (mis. cek header secret), supaya orang lain tidak bisa
menyalahgunakan akun X lu lewat endpoint publiknya. Kalau backend saat ini
belum ada pengaman itu, pertimbangkan menambahkannya.

## Catatan
- Auto-post ke X aktif tanpa moderasi (lihat bagian di atas).
