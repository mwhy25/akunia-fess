-- ============================================================
-- MIGRASI PERBAIKAN — jalankan SEKALI di SQL Editor Supabase,
-- SETELAH schema.sql dan migration_own_auth.sql.
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1) orders.amount boleh 0 (promo akun baru & topup admin)
--    Tanpa ini, insert order Rp0 gagal diam-diam.
-- ------------------------------------------------------------
alter table orders drop constraint if exists orders_amount_check;
alter table orders add constraint orders_amount_check check (amount >= 0);

-- ------------------------------------------------------------
-- 2) posts.content: izinkan sampai 1000 karakter.
--    Batas 280 yang "berbobot" (URL = 23) dicek di API, bukan
--    di DB — kalau tidak, URL panjang bikin insert gagal.
-- ------------------------------------------------------------
alter table posts drop constraint if exists posts_content_check;
alter table posts add constraint posts_content_check
  check (char_length(content) between 1 and 1000);

-- ------------------------------------------------------------
-- 3) Idempotensi pengiriman: satu request_id hanya boleh
--    menghasilkan satu post (mencegah dobel potong kredit /
--    dobel tweet saat user menekan kirim dua kali).
-- ------------------------------------------------------------
alter table posts add column if not exists request_id uuid;
create unique index if not exists posts_user_request
  on posts (user_id, request_id)
  where request_id is not null;

-- ------------------------------------------------------------
-- 4) RPC create_post_with_credit + dukungan request_id
--    (signature lama di-drop agar tidak ambigu)
-- ------------------------------------------------------------
drop function if exists create_post_with_credit(uuid, text, text[]);

create or replace function create_post_with_credit(
  p_user uuid, p_content text, p_images text[], p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  existing_id uuid;
  ok boolean;
begin
  -- Sudah pernah diproses? Kembalikan post yang sama, jangan potong kredit lagi.
  if p_request_id is not null then
    select id into existing_id from posts
    where user_id = p_user and request_id = p_request_id;
    if existing_id is not null then return existing_id; end if;
  end if;

  update accounts set credits = credits - 1
  where id = p_user and credits > 0 and is_banned = false
  returning true into ok;

  if not coalesce(ok, false) then
    raise exception 'INSUFFICIENT_CREDITS_OR_BANNED';
  end if;

  insert into posts (user_id, content, image_urls, status, request_id)
  values (p_user, p_content, coalesce(p_images, '{}'), 'queued', p_request_id)
  returning id into new_id;

  insert into credit_transactions (user_id, amount, type, ref_id)
  values (p_user, -1, 'post', new_id);

  return new_id;
exception when unique_violation then
  -- Balapan dua request identik: request lain sudah insert duluan.
  select id into existing_id from posts
  where user_id = p_user and request_id = p_request_id;
  if existing_id is not null then return existing_id; end if;
  raise;
end $$;

-- ------------------------------------------------------------
-- 5) RPC add_credits — atomic, menggantikan pola read-modify-write
--    di /api/admin/credits (rawan lost update).
-- ------------------------------------------------------------
create or replace function add_credits(
  p_user uuid, p_credits int, p_note text default null, p_by text default null
) returns int language plpgsql security definer set search_path = public as $$
declare new_balance int;
begin
  if p_credits is null or p_credits = 0 then
    raise exception 'INVALID_CREDITS';
  end if;

  update accounts set credits = credits + p_credits
  where id = p_user
  returning credits into new_balance;

  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  insert into credit_transactions (user_id, amount, type, note)
  values (p_user, p_credits, 'admin',
          case when p_note is null then null
               else p_note || case when p_by is null then '' else ' (oleh ' || p_by || ')' end
          end);

  return new_balance;
end $$;

-- ------------------------------------------------------------
-- 6) fulfill_order: order yang sudah "expired" tetap boleh
--    dilunasi (pembayaran telat tetap masuk), dan catat aktornya.
-- ------------------------------------------------------------
create or replace function fulfill_order(
  p_order uuid, p_amount_paid int default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status not in ('pending', 'expired') then return false; end if;

  if p_amount_paid is not null and p_amount_paid < o.amount then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  update orders
     set status = 'paid',
         paid_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('fulfilled_via', 'rpc')
   where id = o.id;

  update accounts set credits = credits + o.credits where id = o.user_id;

  insert into credit_transactions (user_id, amount, type, ref_id)
  values (o.user_id, o.credits, 'purchase', o.id);
  return true;
end $$;

-- ------------------------------------------------------------
-- 7) orders.last_checked_at — throttle cek ke Saweria
--    (jangan panggil Saweria tiap 3 detik per tab).
-- ------------------------------------------------------------
alter table orders add column if not exists last_checked_at timestamptz;
create index if not exists orders_pending_check
  on orders (status, last_checked_at)
  where status = 'pending';

-- ------------------------------------------------------------
-- 8) auth_attempts: izinkan jenis "upload" untuk rate-limit gambar
-- ------------------------------------------------------------
alter table auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table auth_attempts add constraint auth_attempts_kind_check
  check (kind in ('login', 'register', 'recover', 'upload'));

-- ------------------------------------------------------------
-- 9) Hak akses (hanya service_role)
-- ------------------------------------------------------------
revoke execute on function create_post_with_credit(uuid, text, text[], uuid) from public, anon, authenticated;
revoke execute on function add_credits(uuid, int, text, text) from public, anon, authenticated;

grant execute on function create_post_with_credit(uuid, text, text[], uuid) to service_role;
grant execute on function add_credits(uuid, int, text, text) to service_role;

-- ============================================================
-- Verifikasi cepat:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('orders'::regclass, 'posts'::regclass)
--   order by conname;
-- ============================================================
