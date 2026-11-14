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
