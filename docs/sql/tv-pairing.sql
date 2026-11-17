-- ---------------------------------------------------------------------------
-- TV pairing codes: SMATO Ads (the plain TV app) shows a 6-digit code; an
-- admin types it on the TVs page to link that TV to the dashboard. Needs
-- tv-control.sql first. Safe to re-run. Also included at the end of setup.sql.
-- ---------------------------------------------------------------------------

-- Codes waiting to be claimed. Only the functions below touch this table.
create table if not exists device_pairing_codes (
  code text primary key,
  token_hash text not null,
  created_at timestamptz not null default now(),
  auto_number text references autos(auto_number) on delete cascade,
  claimed_at timestamptz
);

alter table device_pairing_codes enable row level security;

-- The TV offers a code, tied to the secret it generated. Its older
-- unclaimed codes and day-old leftovers are cleared. False means that code
-- is taken right now; the TV just picks another.
create or replace function tv_request_code(p_code text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if p_code !~ '^[0-9]{6}$' or length(coalesce(p_token, '')) < 16 then return false; end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  delete from device_pairing_codes
    where auto_number is null and (token_hash = v_hash or created_at < now() - interval '1 day');
  insert into device_pairing_codes (code, token_hash) values (p_code, v_hash)
    on conflict (code) do nothing;
  return found;
end;
$$;

-- The TV asking whether an admin has claimed its code yet: the name it was
-- given, or null.
create or replace function tv_code_status(p_code text, p_token text)
returns text language sql stable security definer set search_path = public as $$
  select auto_number from device_pairing_codes
  where code = p_code
    and token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- An admin linking the TV showing `p_code` under the name `p_name`. Creates
-- the TV's row and hands it the pairing secret, the same one device_poll /
-- device_ack check (tv-control.sql).
create or replace function tv_claim_code(p_code text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name text := upper(btrim(coalesce(p_name, '')));
  v_hash text;
begin
  if (select auth.jwt() ->> 'is_anonymous') is not distinct from 'true'
     or (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Only an admin can add a TV.';
  end if;
  if v_name = '' then raise exception 'Give the TV a name, like TV-01.'; end if;

  select token_hash into v_hash from device_pairing_codes
    where code = btrim(p_code) and auto_number is null and created_at > now() - interval '1 day';
  if v_hash is null then
    raise exception 'That code isn''t valid. Check the 6-digit number on the TV screen.';
  end if;

  insert into autos (auto_number, device_type) values (v_name, 'tv')
    on conflict (auto_number) do update set device_type = 'tv';
  insert into device_secrets (auto_number, token_hash, paired_at) values (v_name, v_hash, now())
    on conflict (auto_number) do update set token_hash = excluded.token_hash, paired_at = now();
  update device_pairing_codes set auto_number = v_name, claimed_at = now() where code = btrim(p_code);
  return v_name;
end;
$$;

grant execute on function tv_request_code(text, text) to anon, authenticated;
grant execute on function tv_code_status(text, text) to anon, authenticated;
revoke all on function tv_claim_code(text, text) from public, anon;
grant execute on function tv_claim_code(text, text) to authenticated;
