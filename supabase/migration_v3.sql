-- Fieldr - Idempotent Migration v3
-- Season history, Universal Player Profiles, Match History & Safe Season Deletion
-- Safe to execute multiple times in Supabase SQL Editor. Non-destructive.

-- 1. EXTEND SEASONS TABLE
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seasons' and column_name = 'start_date'
  ) then
    alter table public.seasons add column start_date text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seasons' and column_name = 'end_date'
  ) then
    alter table public.seasons add column end_date text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seasons' and column_name = 'description'
  ) then
    alter table public.seasons add column description text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seasons' and column_name = 'is_archived'
  ) then
    alter table public.seasons add column is_archived boolean not null default false;
  end if;
end $$;

-- Ensure an archived season cannot be active
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_seasons_archived_not_active'
  ) then
    alter table public.seasons add constraint chk_seasons_archived_not_active
      check (not (is_archived = true and is_active = true));
  end if;
end $$;

-- 2. UNIVERSAL ATHLETES TABLE & NUMERIC CODE SEQUENCE
create sequence if not exists public.athlete_code_seq start with 1 increment by 1;

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  athlete_code integer not null unique default nextval('public.athlete_code_seq'),
  name text not null,
  photo_url text,
  photo_thumb_url text,
  roll_no text,
  notes text,
  created_at timestamptz default now()
);

-- Trigger: athlete_code is immutable once assigned
create or replace function public.prevent_athlete_code_update()
returns trigger language plpgsql as $$
begin
  if new.athlete_code is distinct from old.athlete_code then
    raise exception 'athlete_code is immutable and cannot be updated';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_athlete_code_update on public.athletes;
create trigger trg_prevent_athlete_code_update
before update on public.athletes
for each row execute function public.prevent_athlete_code_update();

-- 3. LINK PLAYERS TABLE TO ATHLETES
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'athlete_id'
  ) then
    alter table public.players add column athlete_id uuid references public.athletes(id) on delete set null;
  end if;
end $$;

-- Backfill athletes from existing players in created_at order
do $$
declare
  r record;
  v_ath_id uuid;
  v_parsed_code int;
  v_max_code int := 0;
begin
  for r in (select * from public.players where athlete_id is null order by created_at asc, id asc) loop
    -- Check if athlete already created for this player name
    select id, athlete_code into v_ath_id, v_parsed_code from public.athletes where lower(trim(name)) = lower(trim(r.name)) limit 1;

    if v_ath_id is null then
      -- If player has existing FLD-XXXX code, preserve the numeric portion if possible
      v_parsed_code := null;
      if r.player_code ~ '^FLD-[0-9]+$' then
        v_parsed_code := substring(r.player_code from '[0-9]+')::integer;
      end if;

      if v_parsed_code is not null and not exists (select 1 from public.athletes where athlete_code = v_parsed_code) then
        insert into public.athletes (athlete_code, name, photo_url, photo_thumb_url, roll_no, notes, created_at)
        values (v_parsed_code, r.name, r.photo_url, r.photo_thumb_url, r.roll_no, r.notes, coalesce(r.created_at, now()))
        returning id into v_ath_id;
      else
        insert into public.athletes (name, photo_url, photo_thumb_url, roll_no, notes, created_at)
        values (r.name, r.photo_url, r.photo_thumb_url, r.roll_no, r.notes, coalesce(r.created_at, now()))
        returning id into v_ath_id;
      end if;
    end if;

    update public.players set athlete_id = v_ath_id where id = r.id;
  end loop;

  -- Advance athlete_code_seq past max code
  select coalesce(max(athlete_code), 0) into v_max_code from public.athletes;
  if v_max_code > 0 then
    perform setval('public.athlete_code_seq', v_max_code);
  end if;
end $$;

-- Unique constraint: an athlete can only have one entry per season per sport
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_players_athlete_season_sport'
  ) then
    alter table public.players add constraint uq_players_athlete_season_sport
      unique (athlete_id, season_id, sport);
  end if;
end $$;

-- Retire the old FLD-prefixed code trigger (replace with no-op)
create or replace function public.set_player_code()
returns trigger language plpgsql as $$
begin
  return new;
end;
$$;

-- 4. RECREATE public_players VIEW (joins entries with athletes, exposing numeric code)
drop view if exists public.public_players;
create view public.public_players as
select
  p.id,
  lpad(a.athlete_code::text, 4, '0') as player_code,
  a.athlete_code,
  a.name,
  a.photo_thumb_url,
  a.photo_url,
  coalesce(p.academic_year, '1st') as academic_year,
  p.sport,
  p.playing_role,
  p.season_id,
  p.athlete_id,
  p.status,
  p.team_id,
  p.base_points,
  p.purchase_price
from public.players p
join public.athletes a on a.id = p.athlete_id;

grant select on public.public_players to anon, authenticated;

-- 5. MATCHES AND MATCH PLAYER STATS TABLES
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  sport text not null,
  round text not null default 'Regular',
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  scheduled_at timestamptz,
  venue text,
  status text not null check (status in ('scheduled', 'completed', 'abandoned')) default 'scheduled',
  score_a text,
  score_b text,
  winner_team_id uuid references public.teams(id) on delete set null,
  result_summary text,
  created_at timestamptz default now()
);

create table if not exists public.match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (match_id, player_id)
);

create index if not exists idx_matches_season on public.matches(season_id);
create index if not exists idx_matches_sport on public.matches(sport);
create index if not exists idx_matches_scheduled on public.matches(scheduled_at);
create index if not exists idx_match_stats_match on public.match_player_stats(match_id);

-- 6. PUBLIC TEAMS VIEW (Never exposes purses publicly)
create or replace view public.public_teams as
select
  id,
  season_id,
  sport,
  name,
  short_code,
  color,
  logo_url,
  owner_display_name,
  created_at
from public.teams;

grant select on public.public_teams to anon, authenticated;

-- 7. ROW-LEVEL SECURITY FOR NEW OBJECTS
alter table public.athletes enable row level security;
alter table public.matches enable row level security;
alter table public.match_player_stats enable row level security;

-- Athletes: public can read non-private columns via view or direct public select policy
drop policy if exists "Allow public read athletes" on public.athletes;
create policy "Allow public read athletes" on public.athletes
  for select using (true);

drop policy if exists "Admin manage athletes" on public.athletes;
create policy "Admin manage athletes" on public.athletes
  for all using (public.is_admin());

-- Matches: public can read all matches across all seasons
drop policy if exists "Allow public read matches" on public.matches;
create policy "Allow public read matches" on public.matches
  for select using (true);

drop policy if exists "Admin manage matches" on public.matches;
create policy "Admin manage matches" on public.matches
  for all using (public.is_admin());

-- Match Player Stats: public read
drop policy if exists "Allow public read match_player_stats" on public.match_player_stats;
create policy "Allow public read match_player_stats" on public.match_player_stats
  for select using (true);

drop policy if exists "Admin manage match_player_stats" on public.match_player_stats;
create policy "Admin manage match_player_stats" on public.match_player_stats
  for all using (public.is_admin());

-- Realtime publication registration
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'athletes'
  ) then
    alter publication supabase_realtime add table public.athletes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;

-- 8. ATOMIC SEASON DELETION FUNCTION (Single transaction, preserves athletes)
create or replace function public.delete_season(p_season_id uuid)
returns void language plpgsql security definer as $$
declare
  v_is_active boolean;
  v_total_seasons int;
begin
  -- 1. Authorization check
  if not public.is_admin() then
    raise exception 'Unauthorized: Administrator access required';
  end if;

  -- 2. Validate season existence
  select is_active into v_is_active from public.seasons where id = p_season_id;
  if not found then
    raise exception 'Season not found';
  end if;

  -- 3. Refuse deletion of active season
  if v_is_active then
    raise exception 'Cannot delete active season. Make another season active first.';
  end if;

  -- 4. Refuse deletion of last remaining season
  select count(*) into v_total_seasons from public.seasons;
  if v_total_seasons <= 1 then
    raise exception 'Cannot delete the only remaining season.';
  end if;

  -- 5. Delete all records linked to this season in dependency order:
  -- Match player stats for matches in this season
  delete from public.match_player_stats
  where match_id in (select id from public.matches where season_id = p_season_id);

  -- Matches
  delete from public.matches where season_id = p_season_id;

  -- Purse transactions
  delete from public.purse_transactions where season_id = p_season_id;

  -- Projector state
  delete from public.projector_state where season_id = p_season_id;

  -- Carousel items scoped to this season
  delete from public.carousel_items where season_id = p_season_id;

  -- Player entries for this season (athletes table is preserved!)
  delete from public.players where season_id = p_season_id;

  -- Teams for this season
  delete from public.teams where season_id = p_season_id;

  -- The season itself
  delete from public.seasons where id = p_season_id;
end;
$$;

grant execute on function public.delete_season(uuid) to authenticated;
revoke execute on function public.delete_season(uuid) from anon;
