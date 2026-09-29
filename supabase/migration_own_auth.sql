-- ============================================================
-- MIGRASI: sistem akun sendiri (tanpa Supabase Auth)
-- Jalankan SEKALI di SQL Editor SETELAH schema.sql.
-- Aman dijalankan pada database KOSONG (belum ada user).
-- ============================================================

-- 1) Lepas ketergantungan ke auth.users -----------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- 2) Tabel accounts (menggantikan profiles + auth.users) ------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,               -- scrypt: "salt:hash" (hex)
  recovery_hash text not null,               -- hash kode pemulihan
  credits int not null default 0 check (credits >= 0),
  role text not null default 'user' check (role in ('user', 'admin')),
  is_banned boolean not null default false,
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

-- username unik tanpa peduli huruf besar/kecil
create unique index if not exists accounts_username_lower on accounts (lower(username));

drop trigger if exists accounts_updated_at on accounts;
create trigger accounts_updated_at before update on accounts
  for each row execute function set_updated_at();

-- 3) Sesi login ------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,           -- sha256 dari token di cookie
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists sessions_account on sessions (account_id);
create index if not exists sessions_expires on sessions (expires_at);

-- 4) Pembatasan percobaan (per IP) ----------------------------
create table if not exists auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'register', 'recover')),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on auth_attempts (kind, ip, created_at desc);

-- 5) Arahkan tabel lama dari profiles → accounts --------------
--    (aman karena belum ada data; kalau sudah ada data, JANGAN jalankan blok ini)
alter table orders drop constraint if exists orders_user_id_fkey;
alter table posts drop constraint if exists posts_user_id_fkey;
alter table credit_transactions drop constraint if exists credit_transactions_user_id_fkey;

alter table orders add constraint orders_user_id_fkey
  foreign key (user_id) references accounts(id) on delete cascade;
alter table posts add constraint posts_user_id_fkey
  foreign key (user_id) references accounts(id) on delete cascade;
alter table credit_transactions add constraint credit_transactions_user_id_fkey
  foreign key (user_id) references accounts(id) on delete cascade;

-- 6) Hapus tabel profiles lama + RPC yang menunjuk ke sana ----
drop function if exists create_post_with_credit(uuid, text, text[]);
drop function if exists reject_post_with_refund(uuid, text);
drop function if exists fulfill_order(uuid, int);
drop table if exists profiles cascade;

-- 7) RPC ulang, kini memakai accounts --------------------------
create or replace function create_post_with_credit(
  p_user uuid, p_content text, p_images text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  ok boolean;
begin
  update accounts set credits = credits - 1
  where id = p_user and credits > 0 and is_banned = false
  returning true into ok;

  if not coalesce(ok, false) then
    raise exception 'INSUFFICIENT_CREDITS_OR_BANNED';
  end if;

  insert into posts (user_id, content, image_urls, status)
  values (p_user, p_content, coalesce(p_images, '{}'), 'queued')
  returning id into new_id;

  insert into credit_transactions (user_id, amount, type, ref_id)
  values (p_user, -1, 'post', new_id);

  return new_id;
end $$;

create or replace function reject_post_with_refund(
  p_post uuid, p_reason text
) returns boolean language plpgsql security definer set search_path = public as $$
declare p posts%rowtype;
begin
  update posts set status = 'rejected', reject_reason = p_reason
  where id = p_post and status in ('queued', 'published')
  returning * into p;

  if not found then return false; end if;

  update accounts set credits = credits + 1 where id = p.user_id;
  insert into credit_transactions (user_id, amount, type, ref_id, note)
  values (p.user_id, 1, 'refund', p.id, p_reason);
  return true;
end $$;

create or replace function fulfill_order(
  p_order uuid, p_amount_paid int default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'pending' then return false; end if;

  if p_amount_paid is not null and p_amount_paid < coalesce(o.total_paid, o.amount) then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  update orders set status = 'paid', paid_at = now() where id = o.id;
  update accounts set credits = credits + o.credits where id = o.user_id;
  insert into credit_transactions (user_id, amount, type, ref_id)
  values (o.user_id, o.credits, 'purchase', o.id);
  return true;
end $$;

-- Bersihkan sesi kedaluwarsa + catatan percobaan lama.
create or replace function cleanup_auth()
returns void language sql security definer set search_path = public as $$
  delete from sessions where expires_at < now();
  delete from auth_attempts where created_at < now() - interval '1 day';
$$;

-- 8) Keamanan: SEMUA akses lewat server (service role) ---------
--    RLS aktif tanpa policy = anon/authenticated tidak bisa apa-apa.
alter table accounts enable row level security;
alter table sessions enable row level security;
alter table auth_attempts enable row level security;
alter table orders enable row level security;
alter table posts enable row level security;
alter table credit_transactions enable row level security;

drop policy if exists "orders_select_own" on orders;
drop policy if exists "posts_select_own" on posts;
drop policy if exists "ctx_select_own" on credit_transactions;

revoke all on accounts, sessions, auth_attempts, orders, posts, credit_transactions from anon, authenticated;

revoke execute on function create_post_with_credit(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function reject_post_with_refund(uuid, text) from public, anon, authenticated;
revoke execute on function fulfill_order(uuid, int) from public, anon, authenticated;
revoke execute on function expire_orders() from public, anon, authenticated;
revoke execute on function cleanup_auth() from public, anon, authenticated;
grant execute on function create_post_with_credit(uuid, text, text[]) to service_role;
grant execute on function reject_post_with_refund(uuid, text) to service_role;
grant execute on function fulfill_order(uuid, int) to service_role;
grant execute on function expire_orders() to service_role;
grant execute on function cleanup_auth() to service_role;

-- ============================================================
-- Jadikan admin (setelah daftar lewat website), ganti username:
-- update accounts set role = 'admin' where lower(username) = lower('usernamelu');
-- ============================================================

-- ============================================================
-- TAMBAHAN: kolom email (data donasi Saweria, BUKAN untuk login).
-- Jalankan SEKALI, setelah blok di atas. Aman untuk database
-- yang sudah dipakai (kolom nullable dulu), atau database baru.
-- ============================================================
alter table accounts add column if not exists email text;

-- Validasi format dasar; boleh NULL untuk akun lama sebelum kolom ini ada.
alter table accounts drop constraint if exists accounts_email_format;
alter table accounts add constraint accounts_email_format
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
