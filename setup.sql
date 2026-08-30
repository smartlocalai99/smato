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
create policy "autos_delete_admin" on autos for delete
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Ads: public read (only active ones, everything else is admin-only).
drop policy if exists "ads_select_all" on ads;
create policy "ads_select_all" on ads for select using (true);

drop policy if exists "ads_write_admin" on ads;
create policy "ads_write_admin" on ads for insert
  to authenticated
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "ads_update_admin" on ads;
create policy "ads_update_admin" on ads for update
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "ads_delete_admin" on ads;
create policy "ads_delete_admin" on ads for delete
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Storage: anyone can read video files, only a signed-in admin can upload
-- or delete them.
drop policy if exists "ads_bucket_read" on storage.objects;
create policy "ads_bucket_read" on storage.objects for select
  using (bucket_id = 'ads');

drop policy if exists "ads_bucket_write_admin" on storage.objects;
create policy "ads_bucket_write_admin" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ads'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "ads_bucket_delete_admin" on storage.objects;
create policy "ads_bucket_delete_admin" on storage.objects for delete
  to authenticated
  using (bucket_id = 'ads'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------------------
-- drivers: private driver records and identity documents. File paths are
-- nullable only while a failed registration is rolled back; a record may not
-- retain a partial document set.
-- ---------------------------------------------------------------------------
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  mobile text not null constraint drivers_mobile_key unique,
  auto_number_plate text not null constraint drivers_auto_number_plate_key unique,
  driving_licence_number text not null constraint drivers_driving_licence_number_key unique,
  aadhaar_number text not null constraint drivers_aadhaar_number_key unique,
  photo_path text,
  driving_licence_image_path text,
  aadhaar_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_documents_complete check (
    (photo_path is null and driving_licence_image_path is null and aadhaar_image_path is null)
    or
    (photo_path is not null and driving_licence_image_path is not null and aadhaar_image_path is not null)
  )
);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists drivers_set_updated_at on drivers;
create trigger drivers_set_updated_at before update on drivers
for each row execute function set_updated_at();

alter table drivers enable row level security;
revoke all on table drivers from anon;
revoke all on table drivers from authenticated;
grant select, insert, update, delete on table drivers to authenticated;

drop policy if exists "drivers_select_admin" on drivers;
create policy "drivers_select_admin" on drivers for select
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "drivers_insert_admin" on drivers;
create policy "drivers_insert_admin" on drivers for insert
  to authenticated
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "drivers_update_admin" on drivers;
create policy "drivers_update_admin" on drivers for update
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "drivers_delete_admin" on drivers;
create policy "drivers_delete_admin" on drivers for delete
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents', 'driver-documents', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "driver_documents_select_admin" on storage.objects;
create policy "driver_documents_select_admin" on storage.objects for select
  to authenticated
  using (bucket_id = 'driver-documents'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "driver_documents_insert_admin" on storage.objects;
create policy "driver_documents_insert_admin" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'driver-documents'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "driver_documents_update_admin" on storage.objects;
create policy "driver_documents_update_admin" on storage.objects for update
  to authenticated
  using (bucket_id = 'driver-documents'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (bucket_id = 'driver-documents'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "driver_documents_delete_admin" on storage.objects;
create policy "driver_documents_delete_admin" on storage.objects for delete
  to authenticated
  using (bucket_id = 'driver-documents'
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Seed the one test auto so it shows up in the admin dropdown immediately.
insert into autos (auto_number, label)
values ('AUTO-01', 'Test auto')
on conflict (auto_number) do nothing;
