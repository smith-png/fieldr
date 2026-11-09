-- Fieldr - Realtime Replication & Security Patch for Supabase
-- Run this script in the Supabase SQL Editor after executing schema.sql.

-- 1. Enable Realtime publication for tables subscribed by Fieldr
do $$
begin
  -- Add projector_state to supabase_realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'projector_state'
  ) then
    alter publication supabase_realtime add table public.projector_state;
  end if;

  -- Add teams to supabase_realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;

  -- Add players to supabase_realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;

  -- Add seasons to supabase_realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'seasons'
  ) then
    alter publication supabase_realtime add table public.seasons;
  end if;

  -- Add purse_transactions to supabase_realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'purse_transactions'
  ) then
    alter publication supabase_realtime add table public.purse_transactions;
  end if;
end $$;

-- 2. Set replica identity to FULL for subscribed tables
-- This ensures update and delete events transmit complete row payloads
alter table public.projector_state replica identity full;
alter table public.teams replica identity full;
alter table public.players replica identity full;
alter table public.seasons replica identity full;
alter table public.purse_transactions replica identity full;

-- 3. Security hardening: grant access to authenticated roles
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
