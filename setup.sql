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
  sim_number text unique,
  last_seen_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_gps_at timestamptz,
  last_gps_accuracy double precision,
  now_playing_title text,
  battery_level smallint check (battery_level between 0 and 100),
  battery_charging boolean,
  screen_off boolean not null default false,
  app_version text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a project that already has `autos` from before these
-- columns existed. Null battery fields just mean "not reported yet" — an
-- older player build, or a tablet whose browser doesn't expose battery info.
alter table autos add column if not exists now_playing_title text;
alter table autos add column if not exists battery_level smallint;
alter table autos drop constraint if exists autos_battery_level_check;
alter table autos add constraint autos_battery_level_check check (battery_level between 0 and 100);
alter table autos add column if not exists battery_charging boolean;
alter table autos add column if not exists screen_off boolean not null default false;
alter table autos add column if not exists sim_number text;
-- Set from the admin's Autos page to move the tablet reporting as this
-- number over to another one; the tablet clears it once it has moved.
alter table autos add column if not exists renumber_to text;
drop index if exists autos_sim_number_idx;
alter table autos drop constraint if exists autos_sim_number_key;
alter table autos add constraint autos_sim_number_key unique (sim_number);

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

-- ---------------------------------------------------------------------------
-- auto_locations: one row per GPS fix, kept forever (unlike autos.last_lat/
-- last_lng, which only ever hold the latest point) — this is what an
-- end-of-day route report reads back for "everywhere this auto went today".
-- ---------------------------------------------------------------------------
create table if not exists auto_locations (
  id uuid primary key default gen_random_uuid(),
  auto_number text not null references autos(auto_number) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists auto_locations_auto_recorded_idx
  on auto_locations (auto_number, recorded_at);

alter table auto_locations enable row level security;

-- The player writes its own fixes with the anon key, same as the live
-- check-in fields on autos above.
drop policy if exists "auto_locations_insert_checkin" on auto_locations;
create policy "auto_locations_insert_checkin" on auto_locations for insert with check (true);

-- Route history is more sensitive than a single live position — it's the
-- product being shown to clients, so only a signed-in admin can read it back.
drop policy if exists "auto_locations_select_admin" on auto_locations;
create policy "auto_locations_select_admin" on auto_locations for select
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "auto_locations_delete_admin" on auto_locations;
create policy "auto_locations_delete_admin" on auto_locations for delete
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
-- drivers: private driver records and identity documents. Every document
-- is optional — a driver can be registered first and their photo, licence
-- and Aadhaar images added later from Edit, in any combination.
-- ---------------------------------------------------------------------------
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  mobile text not null constraint drivers_mobile_key unique,
  alt_mobile text,
  auto_number_plate text not null constraint drivers_auto_number_plate_key unique,
  driving_licence_number text not null constraint drivers_driving_licence_number_key unique,
  aadhaar_number text not null constraint drivers_aadhaar_number_key unique,
  photo_path text,
  driving_licence_image_path text,
  aadhaar_image_path text,
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe to re-run on a project that already has `drivers` from before this
-- column existed. Null last_paid_at just means "never paid yet" — the
-- payment cycle then counts from created_at instead.
alter table drivers add column if not exists last_paid_at timestamptz;

-- A second, optional phone number for the driver.
alter table drivers add column if not exists alt_mobile text;

-- Documents used to be all-or-nothing; each one is optional now.
alter table drivers drop constraint if exists drivers_documents_complete;

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

-- ---------------------------------------------------------------------------
-- TV control: Android TVs running the player, managed from the admin's TVs
-- page — start ads, unlock, restart, unpair — through acknowledged commands.
-- Safe to re-run. Also included at the end of setup.sql.
-- ---------------------------------------------------------------------------

alter table autos add column if not exists device_type text not null default 'tablet';
alter table autos drop constraint if exists autos_device_type_check;
alter table autos add constraint autos_device_type_check check (device_type in ('tablet', 'tv'));

-- Reported by the TV itself on every heartbeat.
alter table autos add column if not exists ads_mode text;
alter table autos drop constraint if exists autos_ads_mode_check;
alter table autos add constraint autos_ads_mode_check check (ads_mode in ('advertising', 'unlocked'));
alter table autos add column if not exists auto_start boolean;
alter table autos add column if not exists device_owner boolean;

-- Each TV's pairing secret and recovery PIN, as hashes, kept out of the
-- publicly readable autos table. Only admins and the functions below see it.
create table if not exists device_secrets (
  auto_number text primary key references autos(auto_number) on delete cascade,
  token_hash text,
  recovery_pin_hash text,
  paired_at timestamptz
);

alter table device_secrets enable row level security;

drop policy if exists "device_secrets_admin" on device_secrets;
create policy "device_secrets_admin" on device_secrets for all
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- One row per command sent to a TV. A command only reads as done once the
-- TV itself has acknowledged it.
create table if not exists device_commands (
  id uuid primary key default gen_random_uuid(),
  auto_number text not null references autos(auto_number) on delete cascade,
  command text not null check (command in ('lock', 'unlock', 'restart', 'unpair')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'requested'
    check (status in ('requested', 'received', 'completed', 'failed', 'cancelled')),
  detail text,
  requested_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz,
  completed_at timestamptz
);

create index if not exists device_commands_device_idx on device_commands (auto_number, created_at desc);

alter table device_commands enable row level security;

drop policy if exists "device_commands_admin" on device_commands;
create policy "device_commands_admin" on device_commands for all
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- The TV side. A TV proves who it is with the secret it generated when it
-- paired; only its hash is stored. These run as the table owner so the
-- anon key can call them without being able to read or write the tables.
create or replace function device_token_ok(p_auto text, p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from device_secrets
    where auto_number = p_auto
      and token_hash is not null
      and token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  );
$$;

-- First pairing claims the TV; after that only the same secret is accepted,
-- until an admin unpairs it.
create or replace function device_pair(p_auto text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_existing text;
begin
  if p_auto is null or length(coalesce(p_token, '')) < 16 then return false; end if;
  if not exists (select 1 from autos where auto_number = p_auto) then return false; end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select token_hash into v_existing from device_secrets where auto_number = p_auto;
  if not found then
    insert into device_secrets (auto_number, token_hash, paired_at) values (p_auto, v_hash, now());
    return true;
  end if;
  if v_existing is null then
    update device_secrets set token_hash = v_hash, paired_at = now() where auto_number = p_auto;
    return true;
  end if;
  return v_existing = v_hash;
end;
$$;

-- What the TV should do: its recovery PIN hash and any commands it hasn't
-- finished. Null when the secret doesn't match.
create or replace function device_poll(p_auto text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not device_token_ok(p_auto, p_token) then return null; end if;
  return jsonb_build_object(
    'recovery_pin_hash', (select recovery_pin_hash from device_secrets where auto_number = p_auto),
    'commands', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'command', command, 'payload', payload, 'status', status)
        order by created_at)
      from device_commands
      where auto_number = p_auto and status in ('requested', 'received')
    ), '[]'::jsonb)
  );
end;
$$;

-- The TV reporting progress on one command. Finishing an unpair also
-- releases the pairing, so the TV (or a replacement) can pair again.
create or replace function device_ack(p_auto text, p_token text, p_id uuid, p_status text, p_detail text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_command text;
begin
  if not device_token_ok(p_auto, p_token) then return false; end if;
  if p_status not in ('received', 'completed', 'failed') then return false; end if;
  update device_commands
    set status = p_status,
        detail = coalesce(p_detail, detail),
        received_at = coalesce(received_at, now()),
        completed_at = case when p_status in ('completed', 'failed') then now() else completed_at end
    where id = p_id and auto_number = p_auto and status in ('requested', 'received')
    returning command into v_command;
  if v_command is null then return false; end if;
  if v_command = 'unpair' and p_status = 'completed' then
    update device_secrets set token_hash = null, paired_at = null where auto_number = p_auto;
  end if;
  return true;
end;
$$;

revoke all on function device_token_ok(text, text) from public, anon, authenticated;
grant execute on function device_pair(text, text) to anon, authenticated;
grant execute on function device_poll(text, text) to anon, authenticated;
grant execute on function device_ack(text, text, uuid, text, text) to anon, authenticated;
