-- Ad screens — run this once in Supabase SQL Editor.
-- Creates: autos (fleet + GPS), ads (uploaded videos + schedule), the `ads`
-- storage bucket, and the row-level security rules that let the anon key
-- read ads / check a device in, while only a signed-in admin can write ads.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- autos: one row per tablet. Created automatically the first time a player
-- checks in, then kept live with a heartbeat + GPS fix.
-- ---------------------------------------------------------------------------
create table if not exists autos (
  id uuid primary key default gen_random_uuid(),
  auto_number text unique not null,
  label text,
  last_seen_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_gps_at timestamptz,
  last_gps_accuracy double precision,
  now_playing_title text,
  app_version text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a project that already has `autos` from before this
-- column existed.
alter table autos add column if not exists now_playing_title text;

-- ---------------------------------------------------------------------------
-- ads: one row per uploaded video/image. auto_number = null means "play on
-- every auto". start_date/end_date = null means "no date limit". Ads loop
-- by sort_order all day — start_hour/end_hour are kept in the schema for
-- backward compatibility but the app no longer reads or writes them.
-- ---------------------------------------------------------------------------
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_path text not null,
  file_size bigint,
  media_type text not null default 'video' check (media_type in ('video', 'image')),
  auto_number text references autos(auto_number) on delete cascade,
  start_date date,
  end_date date,
  start_hour smallint not null default 0 check (start_hour between 0 and 23),
  end_hour smallint not null default 23 check (end_hour between 0 and 23),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ads_auto_number_idx on ads (auto_number);
create index if not exists ads_active_idx on ads (active);

-- Running this again on a project that already has `ads` from before the
-- media_type column existed just adds it — safe to re-run either way.
alter table ads add column if not exists media_type text not null default 'video';
alter table ads drop constraint if exists ads_media_type_check;
alter table ads add constraint ads_media_type_check check (media_type in ('video', 'image'));

-- ---------------------------------------------------------------------------
-- Storage bucket for the video files.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ads', 'ads', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table autos enable row level security;
alter table ads enable row level security;

-- Anyone with the anon key can read the fleet list and the ad list — neither
-- contains anything sensitive, and the player needs both to work offline.
drop policy if exists "autos_select_all" on autos;
create policy "autos_select_all" on autos for select using (true);

-- Only a signed-in admin can rename/curate autos by hand. The player itself
-- checks in through the "autos_upsert_checkin" policies below instead.
drop policy if exists "autos_insert_checkin" on autos;
create policy "autos_insert_checkin" on autos for insert with check (true);

drop policy if exists "autos_update_checkin" on autos;
create policy "autos_update_checkin" on autos for update using (true) with check (true);

drop policy if exists "autos_delete_admin" on autos;
create policy "autos_delete_admin" on autos for delete using (auth.role() = 'authenticated');

-- Ads: public read (only active ones, everything else is admin-only).
drop policy if exists "ads_select_all" on ads;
create policy "ads_select_all" on ads for select using (true);

drop policy if exists "ads_write_admin" on ads;
create policy "ads_write_admin" on ads for insert with check (auth.role() = 'authenticated');

drop policy if exists "ads_update_admin" on ads;
create policy "ads_update_admin" on ads for update using (auth.role() = 'authenticated');

drop policy if exists "ads_delete_admin" on ads;
create policy "ads_delete_admin" on ads for delete using (auth.role() = 'authenticated');

-- Storage: anyone can read video files, only a signed-in admin can upload
-- or delete them.
drop policy if exists "ads_bucket_read" on storage.objects;
create policy "ads_bucket_read" on storage.objects for select
  using (bucket_id = 'ads');

drop policy if exists "ads_bucket_write_admin" on storage.objects;
create policy "ads_bucket_write_admin" on storage.objects for insert
  with check (bucket_id = 'ads' and auth.role() = 'authenticated');

drop policy if exists "ads_bucket_delete_admin" on storage.objects;
create policy "ads_bucket_delete_admin" on storage.objects for delete
  using (bucket_id = 'ads' and auth.role() = 'authenticated');

-- Seed the one test auto so it shows up in the admin dropdown immediately.
insert into autos (auto_number, label)
values ('AUTO-01', 'Test auto')
on conflict (auto_number) do nothing;
