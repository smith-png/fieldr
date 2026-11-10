-- Fieldr - Idempotent Migration v2
-- Safe to execute multiple times in Supabase SQL Editor

-- 1. ADD COLUMNS TO PLAYERS TABLE IF MISSING
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'academic_year'
  ) then
    alter table public.players add column academic_year text check (academic_year in ('1st', '2nd', '3rd', 'Final')) default '1st';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'photo_thumb_url'
  ) then
    alter table public.players add column photo_thumb_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'player_code'
  ) then
    alter table public.players add column player_code text;
  end if;
end $$;

-- Backfill academic_year from year_batch if present and academic_year is empty
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'year_batch'
  ) then
    update public.players
    set academic_year = case
      when academic_year in ('1st', '2nd', '3rd', 'Final') then academic_year
      when year_batch ilike '%1%' then '1st'
      when year_batch ilike '%2%' then '2nd'
      when year_batch ilike '%3%' then '3rd'
      else 'Final'
    end
    where academic_year is null or academic_year = '';
  end if;
end $$;

-- 2. AUTO-ASSIGN PLAYER_CODE TRIGGER (FLD-0001 per season, zero-padded, incrementing)
create or replace function public.set_player_code()
returns trigger language plpgsql as $$
declare
  v_next_num integer;
begin
  if new.player_code is null or new.player_code = '' then
    select coalesce(max(nullif(regexp_replace(player_code, '^FLD-', ''), '')::integer), 0) + 1
    into v_next_num
    from public.players
    where season_id = new.season_id;

    new.player_code := 'FLD-' || lpad(v_next_num::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_player_code on public.players;
create trigger trg_set_player_code
before insert on public.players
for each row execute function public.set_player_code();

-- Backfill existing players lacking player_code sequentially per season
do $$
declare
  r record;
  v_num integer;
begin
  for r in (select distinct season_id from public.players where player_code is null) loop
    v_num := 1;
    for r in (select id from public.players where season_id = r.season_id and player_code is null order by created_at asc, id asc) loop
      update public.players
      set player_code = 'FLD-' || lpad(v_num::text, 4, '0')
      where id = r.id;
      v_num := v_num + 1;
    end loop;
  end loop;
end $$;

-- Ensure unique player_code per season
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_players_season_player_code'
  ) then
    alter table public.players add constraint uq_players_season_player_code unique (season_id, player_code);
  end if;
end $$;

-- 3. PUBLIC VIEW: public_players (Exposes only public non-sensitive fields)
create or replace view public.public_players as
select
  id,
  player_code,
  name,
  photo_thumb_url,
  photo_url,
  coalesce(academic_year, '1st') as academic_year,
  sport,
  playing_role,
  season_id
from public.players;

grant select on public.public_players to anon, authenticated;

-- 4. CAROUSEL ITEMS TABLE
create table if not exists public.carousel_items (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) > 0 and char_length(text) <= 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  season_id uuid references public.seasons(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.carousel_items enable row level security;

drop policy if exists "Allow public read carousel_items" on public.carousel_items;
create policy "Allow public read carousel_items" on public.carousel_items
  for select using (true);

drop policy if exists "Admin manage carousel_items" on public.carousel_items;
create policy "Admin manage carousel_items" on public.carousel_items
  for all using (public.is_admin());

-- Seed default carousel strip items if empty
insert into public.carousel_items (text, sort_order, active)
select t.text, t.sort_order, t.active
from (
  values
    ('LIVE PLAYER AUCTIONS - OFFICIAL TOURNAMENT SYSTEM', 0, true),
    ('DRAFT. BID. WIN. - REAL-TIME BIG SCREEN DISPLAY', 1, true),
    ('CRICKET / FUTSAL / VOLLEYBALL SQUADS', 2, true)
) as t(text, sort_order, active)
where not exists (select 1 from public.carousel_items limit 1);

-- 5. SITE SETTINGS TABLE
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "Allow public read site_settings" on public.site_settings;
create policy "Allow public read site_settings" on public.site_settings
  for select using (true);

drop policy if exists "Admin manage site_settings" on public.site_settings;
create policy "Admin manage site_settings" on public.site_settings
  for all using (public.is_admin());

-- Seed default Help, About and Auction Timing settings
insert into public.site_settings (key, value)
values
  ('help_page', '{"title": "Help & Instructions", "body": "Welcome to Fieldr.\n\nFor Tournament Admins:\nUse the admin dashboard to configure teams, register player rosters, and execute purse adjustments.\n\nFor Audience & Displays:\nThe Projector view updates in real time to show live player spotlights, franchise purse balances, and finalized team squads."}'::jsonb),
  ('about_page', '{"title": "About Fieldr", "body": "Fieldr is a specialized live athletic auction platform.\n\nBuilt for high-energy collegiate and club sports draft events with real-time big screen synchronisation, audited team purses, and transparent player scouting."}'::jsonb),
  ('auction_timing', '{"window_duration_seconds": 60}'::jsonb)
on conflict (key) do nothing;

-- 6. REALTIME REPLICATION PUBLICATION FOR NEW TABLES
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'carousel_items'
  ) then
    alter publication supabase_realtime add table public.carousel_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_settings'
  ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end $$;

-- 7. STORAGE POLICIES: PUBLIC READ ON PHOTOS BUCKET
insert into storage.buckets (id, name, public)
values ('fieldr-assets', 'fieldr-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated read assets" on storage.objects;
drop policy if exists "Public read assets" on storage.objects;
create policy "Public read assets" on storage.objects
  for select using (bucket_id = 'fieldr-assets');

-- 8. UPDATE VOLLEYBALL ROLES SPECIFICATION
update public.sports
set roles = array['Setter', 'Outside hitter', 'Middle blocker', 'Opposite', 'Libero']
where id = 'volleyball';
