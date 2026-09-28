-- ============================================================
-- MENFESS — SCHEMA LENGKAP (jalankan di Supabase SQL Editor)
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  email text,
  credits int not null default 0 check (credits >= 0),
  role text not null default 'user' check (role in ('user', 'admin')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'user_' || substr(new.id::text, 1, 8)),
    new.email
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- ORDERS ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  provider_ref text unique,
  package_id text not null,
  amount int not null check (amount > 0),
  total_paid int,
  credits int not null check (credits > 0),
  qr_string text,
  qr_image text,
  invoice_url text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'failed', 'refunded')),
  expires_at timestamptz,
  paid_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_status on orders (user_id, status);
create index if not exists orders_status_created on orders (status, created_at desc);

-- ---------- POSTS ----------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 280),
  image_urls text[] not null default '{}' check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 4),
  status text not null default 'queued'
    check (status in ('queued', 'published', 'rejected', 'deleted')),
  reject_reason text,
  tweet_url text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists posts_user_created on posts (user_id, created_at desc);
create index if not exists posts_status_created on posts (status, created_at desc);

-- ---------- CREDIT TRANSACTIONS (ledger) ----------
create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount int not null,
  type text not null check (type in ('purchase', 'post', 'refund', 'admin')),
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ctx_user_created on credit_transactions (user_id, created_at desc);

-- ============================================================
-- RPC (semua atomic; hanya boleh dipanggil service role)
-- ============================================================

-- Buat post + potong 1 kredit dalam satu transaksi.
create or replace function create_post_with_credit(
  p_user uuid, p_content text, p_images text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  ok boolean;
begin
  update profiles set credits = credits - 1
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

-- Tolak post + kembalikan 1 kredit (idempotent per post).
create or replace function reject_post_with_refund(
  p_post uuid, p_reason text
) returns boolean language plpgsql security definer set search_path = public as $$
declare p posts%rowtype;
begin
  update posts set status = 'rejected', reject_reason = p_reason
  where id = p_post and status in ('queued', 'published')
  returning * into p;

  if not found then return false; end if;

  update profiles set credits = credits + 1 where id = p.user_id;
  insert into credit_transactions (user_id, amount, type, ref_id, note)
  values (p.user_id, 1, 'refund', p.id, p_reason);
  return true;
end $$;

-- Selesaikan order: status paid + tambah kredit + ledger, idempotent.
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
  update profiles set credits = credits + o.credits where id = o.user_id;
  insert into credit_transactions (user_id, amount, type, ref_id)
  values (o.user_id, o.credits, 'purchase', o.id);
  return true;
end $$;

-- Tandai order pending yang sudah lewat waktu jadi expired.
create or replace function expire_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update orders set status = 'expired'
  where status = 'pending' and expires_at is not null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function create_post_with_credit(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function reject_post_with_refund(uuid, text) from public, anon, authenticated;
revoke execute on function fulfill_order(uuid, int) from public, anon, authenticated;
revoke execute on function expire_orders() from public, anon, authenticated;
grant execute on function create_post_with_credit(uuid, text, text[]) to service_role;
grant execute on function reject_post_with_refund(uuid, text) to service_role;
grant execute on function fulfill_order(uuid, int) to service_role;
grant execute on function expire_orders() to service_role;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table orders enable row level security;
alter table posts enable row level security;
alter table credit_transactions enable row level security;

-- profiles: baca punya sendiri. Tidak ada policy update/insert → hanya via service role.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select to authenticated using (id = auth.uid());

-- orders: baca punya sendiri saja.
drop policy if exists "orders_select_own" on orders;
create policy "orders_select_own" on orders
  for select to authenticated using (user_id = auth.uid());

-- posts: baca punya sendiri saja (feed publik ada di Twitter, bukan di sini).
drop policy if exists "posts_select_own" on posts;
create policy "posts_select_own" on posts
  for select to authenticated using (user_id = auth.uid());

-- ledger: baca punya sendiri saja.
drop policy if exists "ctx_select_own" on credit_transactions;
create policy "ctx_select_own" on credit_transactions
  for select to authenticated using (user_id = auth.uid());

-- Cegah user mengubah role/credits lewat client walau ada policy di masa depan.
revoke update on profiles from anon, authenticated;
revoke insert, delete on profiles from anon, authenticated;

-- ============================================================
-- STORAGE: bucket gambar post
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Upload dilakukan lewat API (service role), jadi tidak ada policy insert untuk client.
drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read" on storage.objects
  for select using (bucket_id = 'post-images');

-- ============================================================
-- Jadikan akun admin (ganti email):
-- update profiles set role = 'admin' where email = 'kamu@email.com';
-- ============================================================
