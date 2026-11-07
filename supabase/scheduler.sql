-- ============================================================
-- SCHEDULER ADMIN (tanpa kredit) — jalankan SEKALI di SQL Editor.
-- Aman dijalankan berulang (idempotent).
--
-- Fitur internal admin: impor antrian post (mis. dari xscrape
-- index.xlsx / post_queue.json) lalu menjadwalkan pempostingan
-- otomatis ke X lewat backend Flask/twikit.
--
-- PENTING: flow ini TIDAK memotong kredit (bukan menfess publik).
-- Semua akses memakai service_role saja.
-- ============================================================

-- ------------------------------------------------------------
-- 1) scheduled_posts — satu baris = satu post terjadwal.
-- ------------------------------------------------------------
create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  -- id unik sumber (post_id X / source_id). Dipakai dedup saat impor ulang.
  source_ref text unique,
  text text not null,
  photo_url text,
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'failed', 'skipped')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  tweet_id text,
  attempts int not null default 0,
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_posts_due
  on scheduled_posts (scheduled_at) where status = 'pending';

-- ------------------------------------------------------------
-- 2) scheduler_logs — jejak eksekusi cron/manual, untuk audit.
-- ------------------------------------------------------------
create table if not exists scheduler_logs (
  id bigint generated always as identity primary key,
  trigger text not null default 'cron',   -- cron | manual | admin
  posted int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  detail text,
  run_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) Hak akses: hanya service_role.
-- ------------------------------------------------------------
alter table scheduled_posts enable row level security;
alter table scheduler_logs enable row level security;
revoke all on scheduled_posts, scheduler_logs from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4) Helper: klaim satu post pending yang sudah jatuh tempo.
--    Mengunci baris (for update skip locked) agar dua eksekusi
--    paralel tidak mengklaim item yang sama. Mengubah status jadi
--    'pending' tapi menaikkan attempts; hasil nyata ditulis lewat
--    record_scheduled_result.
--    Return: 1 baris scheduled_posts, atau null kalau tak ada yang due.
-- ------------------------------------------------------------
create or replace function claim_next_due()
returns scheduled_posts
language plpgsql security definer set search_path = public as $$
declare
  row scheduled_posts;
begin
  select * into row from scheduled_posts
  where status = 'pending'
    and (scheduled_at is null or scheduled_at <= now())
  order by coalesce(scheduled_at, now()) asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update scheduled_posts
     set attempts = attempts + 1
   where id = row.id;
  row.attempts := row.attempts + 1;
  return row;
end $$;

revoke execute on function claim_next_due() from public, anon, authenticated;
grant execute on function claim_next_due() to service_role;

-- ------------------------------------------------------------
-- 5) Helper: tulis hasil satu post.
-- ------------------------------------------------------------
create or replace function record_scheduled_result(
  p_id uuid,
  p_status text,             -- 'posted' | 'failed'
  p_tweet text default null,
  p_error text default null
) returns void
language sql security definer set search_path = public as $$
  update scheduled_posts
     set status    = p_status,
         posted_at = case when p_status = 'posted' then now() else posted_at end,
         tweet_id  = coalesce(p_tweet, tweet_id),
         last_error = p_error
   where id = p_id;
$$;

revoke execute on function record_scheduled_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function record_scheduled_result(uuid, text, text, text) to service_role;

-- ============================================================
-- Verifikasi cepat:
--   select count(*) from scheduled_posts;
--   select * from scheduler_logs order by run_at desc limit 5;
-- ============================================================
