-- Fieldr - DRGMC College Live Sports Player Auction Database Schema
-- No emoji in this file as per specification.

create extension if not exists "uuid-ossp";

-- 1. SEASONS TABLE
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean default false,
  created_at timestamptz default now()
);

-- 2. SPORTS TABLE (Lookup)
create table if not exists public.sports (
  id text primary key,
  name text not null,
  roles text[] not null
);

-- Seed core sports
insert into public.sports (id, name, roles) values
  ('cricket', 'Cricket', array['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']),
  ('futsal', 'Futsal', array['Goalkeeper', 'Defender', 'Winger', 'Pivot']),
  ('volleyball', 'Volleyball', array['Setter', 'Spiker', 'Libero', 'Blocker'])
on conflict (id) do update set
  name = excluded.name,
  roles = excluded.roles;

-- 3. USER PROFILES TABLE (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'projector')),
  created_at timestamptz default now()
);

-- 4. TEAMS TABLE
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  sport text not null,
  name text not null,
  short_code varchar(3) not null,
  color varchar(7) not null,
  logo_url text,
  owner_display_name text,
  owner_user_id uuid references auth.users(id) on delete set null,
  starting_purse numeric not null default 1000,
  current_purse numeric not null default 1000,
  created_at timestamptz default now()
);

-- 5. PLAYERS TABLE
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  sport text not null,
  playing_role text not null,
  year_batch text not null,
  roll_no text,
  photo_url text,
  base_points numeric not null default 100,
  status text not null check (status in ('available', 'sold')) default 'available',
  team_id uuid references public.teams(id) on delete set null,
  purchase_price numeric,
  notes text,
  created_at timestamptz default now()
);

-- 6. PURSE TRANSACTIONS TABLE
create table if not exists public.purse_transactions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  type text not null check (type in ('initial', 'add', 'deduct', 'set')),
  amount numeric not null,
  balance_after numeric not null,
  reason text,
  created_at timestamptz default now(),
  created_by text default 'admin'
);

-- 7. PROJECTOR STATE TABLE
create table if not exists public.projector_state (
  season_id uuid primary key references public.seasons(id) on delete cascade,
  mode text not null check (mode in ('idle', 'teams', 'player', 'roster')) default 'idle',
  player_id uuid references public.players(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  updated_at timestamptz default now()
);

-- HELPER FUNCTIONS FOR ROLE CHECKING
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_authenticated()
returns boolean language sql security definer as $$
  select auth.uid() is not null;
$$;

-- ATOMIC PURSE TRANSACTION FUNCTION
create or replace function public.execute_purse_transaction(
  p_team_id uuid,
  p_season_id uuid,
  p_type text,
  p_amount numeric,
  p_reason text,
  p_created_by text default 'admin'
) returns numeric language plpgsql security definer as $$
declare
  v_current numeric;
  v_new numeric;
begin
  select current_purse into v_current
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  if p_type = 'add' then
    v_new := v_current + p_amount;
  elsif p_type = 'deduct' then
    v_new := v_current - p_amount;
  elsif p_type = 'set' or p_type = 'initial' then
    v_new := p_amount;
  else
    raise exception 'Invalid transaction type: %', p_type;
  end if;

  if v_new < 0 then
    raise exception 'Insufficient purse balance. Resulting balance would be negative (%)', v_new;
  end if;

  update public.teams
  set current_purse = v_new
  where id = p_team_id;

  insert into public.purse_transactions (
    season_id,
    team_id,
    type,
    amount,
    balance_after,
    reason,
    created_by
  ) values (
    p_season_id,
    p_team_id,
    p_type,
    p_amount,
    v_new,
    p_reason,
    p_created_by
  );

  return v_new;
end;
$$;

-- GLOBAL STARTING PURSE RESET FUNCTION
create or replace function public.reset_all_purses(
  p_season_id uuid,
  p_starting_amount numeric,
  p_reason text default 'Global purse reset'
) returns void language plpgsql security definer as $$
declare
  t record;
begin
  for t in select id from public.teams where season_id = p_season_id loop
    perform public.execute_purse_transaction(
      t.id,
      p_season_id,
      'set',
      p_starting_amount,
      p_reason,
      'admin'
    );
    update public.teams
    set starting_purse = p_starting_amount
    where id = t.id;
  end loop;
end;
-- ATOMIC PLAYER ASSIGNMENT RPC
create or replace function public.assign_player_to_team(
  p_player_id uuid,
  p_team_id uuid,
  p_price numeric default 0
) returns void language plpgsql security definer as $$
declare
  v_player record;
  v_team record;
  v_price numeric;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found';
  end if;

  if v_player.status = 'sold' then
    raise exception 'Player already assigned';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found';
  end if;

  if lower(v_player.sport) != lower(v_team.sport) then
    raise exception 'Sport mismatch: Player is in %, Team is in %', v_player.sport, v_team.sport;
  end if;

  v_price := coalesce(p_price, 0);

  if v_price > 0 then
    if v_team.current_purse < v_price then
      raise exception 'Insufficient purse balance. Team only has % points available, price is %', v_team.current_purse, v_price;
    end if;

    perform public.execute_purse_transaction(
      p_team_id,
      v_player.season_id,
      'deduct',
      v_price,
      'Player assigned: ' || v_player.name,
      'admin'
    );
  end if;

  update public.players
  set team_id = p_team_id,
      status = 'sold',
      purchase_price = case when v_price > 0 then v_price else null end
  where id = p_player_id;
end;
$$;

-- ATOMIC PLAYER UNASSIGNMENT RPC
create or replace function public.unassign_player_from_team(
  p_player_id uuid
) returns void language plpgsql security definer as $$
declare
  v_player record;
  v_price numeric;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found';
  end if;

  v_price := coalesce(v_player.purchase_price, 0);

  if v_player.team_id is not null and v_price > 0 then
    perform public.execute_purse_transaction(
      v_player.team_id,
      v_player.season_id,
      'add',
      v_price,
      'Refund: player unassigned (' || v_player.name || ')',
      'admin'
    );
  end if;

  update public.players
  set team_id = null,
      status = 'available',
      purchase_price = null
  where id = p_player_id;
end;
$$;

-- ENABLE ROW-LEVEL SECURITY
alter table public.seasons enable row level security;
alter table public.sports enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.purse_transactions enable row level security;
alter table public.projector_state enable row level security;

-- POLICIES: ADMIN HAS FULL ACCESS, PROJECTOR HAS READ ACCESS
-- seasons
create policy "Authenticated read seasons" on public.seasons for select using (auth.role() = 'authenticated');
create policy "Admin manage seasons" on public.seasons for all using (public.is_admin());

-- sports
create policy "Authenticated read sports" on public.sports for select using (auth.role() = 'authenticated');
create policy "Admin manage sports" on public.sports for all using (public.is_admin());

-- profiles
create policy "Authenticated read profiles" on public.profiles for select using (auth.role() = 'authenticated');
create policy "Admin manage profiles" on public.profiles for all using (public.is_admin());

-- teams
create policy "Authenticated read teams" on public.teams for select using (auth.role() = 'authenticated');
create policy "Admin manage teams" on public.teams for all using (public.is_admin());

-- players
create policy "Authenticated read players" on public.players for select using (auth.role() = 'authenticated');
create policy "Admin manage players" on public.players for all using (public.is_admin());

-- purse_transactions
create policy "Authenticated read purse_transactions" on public.purse_transactions for select using (auth.role() = 'authenticated');
create policy "Admin manage purse_transactions" on public.purse_transactions for all using (public.is_admin());

-- projector_state
create policy "Authenticated read projector_state" on public.projector_state for select using (auth.role() = 'authenticated');
create policy "Admin manage projector_state" on public.projector_state for all using (public.is_admin());

-- STORAGE BUCKET CONFIGURATION
insert into storage.buckets (id, name, public)
values ('fieldr-assets', 'fieldr-assets', true)
on conflict (id) do nothing;

create policy "Authenticated read assets" on storage.objects
  for select using (bucket_id = 'fieldr-assets' and auth.role() = 'authenticated');

create policy "Admin upload assets" on storage.objects
  for insert with check (bucket_id = 'fieldr-assets' and public.is_admin());

create policy "Admin update assets" on storage.objects
  for update using (bucket_id = 'fieldr-assets' and public.is_admin());

create policy "Admin delete assets" on storage.objects
  for delete using (bucket_id = 'fieldr-assets' and public.is_admin());
