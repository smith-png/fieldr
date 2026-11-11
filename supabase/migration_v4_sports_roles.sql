-- Fieldr - Idempotent Migration v4: Sports & Roles Management RPCs and Policies
-- Safe to execute multiple times in Supabase SQL Editor.

-- 1. Allow public read access to public.sports so public roster pages can read dynamic sport roles
drop policy if exists "Allow public read sports" on public.sports;
create policy "Allow public read sports" on public.sports
  for select using (true);

-- 2. Atomic RPC to rename a role on a sport and update all existing player entries of that sport
create or replace function public.rename_sport_role(
  p_sport_id text,
  p_old_role text,
  p_new_role text
) returns integer language plpgsql security definer as $$
declare
  v_sport public.sports%rowtype;
  v_new_trimmed text;
  v_updated_roles text[] := array[]::text[];
  v_role text;
  v_found boolean := false;
  v_players_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Administrator access required';
  end if;

  v_new_trimmed := btrim(coalesce(p_new_role, ''));
  if v_new_trimmed = '' then
    raise exception 'Role name cannot be empty';
  end if;

  select * into v_sport
  from public.sports
  where lower(id) = lower(p_sport_id) or lower(name) = lower(p_sport_id)
  for update;

  if not found then
    raise exception 'Sport not found: %', p_sport_id;
  end if;

  -- Check for case-insensitive duplicate against other roles in the same sport
  foreach v_role in array v_sport.roles loop
    if lower(v_role) = lower(p_old_role) then
      v_found := true;
      v_updated_roles := array_append(v_updated_roles, v_new_trimmed);
    else
      if lower(v_role) = lower(v_new_trimmed) then
        raise exception 'Role "%" already exists in %', v_new_trimmed, v_sport.name;
      end if;
      v_updated_roles := array_append(v_updated_roles, v_role);
    end if;
  end loop;

  if not v_found then
    raise exception 'Role "%" not found in %', p_old_role, v_sport.name;
  end if;

  update public.sports
  set roles = v_updated_roles
  where id = v_sport.id;

  update public.players
  set playing_role = v_new_trimmed
  where lower(sport) = lower(v_sport.name)
    and lower(playing_role) = lower(p_old_role);

  get diagnostics v_players_updated = row_count;

  return v_players_updated;
end;
$$;

grant execute on function public.rename_sport_role(text, text, text) to authenticated;
revoke execute on function public.rename_sport_role(text, text, text) from anon;

-- 3. Atomic RPC to delete an unused role from a sport (blocks if any player uses it)
create or replace function public.delete_sport_role(
  p_sport_id text,
  p_role text
) returns void language plpgsql security definer as $$
declare
  v_sport public.sports%rowtype;
  v_usage_count integer := 0;
  v_updated_roles text[] := array[]::text[];
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Administrator access required';
  end if;

  select * into v_sport
  from public.sports
  where lower(id) = lower(p_sport_id) or lower(name) = lower(p_sport_id)
  for update;

  if not found then
    raise exception 'Sport not found: %', p_sport_id;
  end if;

  select count(*) into v_usage_count
  from public.players
  where lower(sport) = lower(v_sport.name)
    and lower(playing_role) = lower(p_role);

  if v_usage_count > 0 then
    raise exception '% players use this role. Rename it or change those players first.', v_usage_count;
  end if;

  foreach v_role in array v_sport.roles loop
    if lower(v_role) != lower(p_role) then
      v_updated_roles := array_append(v_updated_roles, v_role);
    end if;
  end loop;

  update public.sports
  set roles = v_updated_roles
  where id = v_sport.id;
end;
$$;

grant execute on function public.delete_sport_role(text, text) to authenticated;
revoke execute on function public.delete_sport_role(text, text) from anon;
