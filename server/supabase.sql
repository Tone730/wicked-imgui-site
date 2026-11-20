-- Supabase schema for Wicked Imgui's optional managed persistence.
-- Run once in the Supabase SQL editor, then set STORAGE_BACKEND=supabase,
-- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API host.

create table if not exists public.wicked_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The service role key bypasses RLS. Do not grant anon/authenticated access to
-- this table: it holds password hashes, sessions and license keys.
alter table public.wicked_state enable row level security;

-- Optional: keep only the latest snapshot per collection if you ever rotate stores.
-- delete from public.wicked_state where id not in ('accounts', 'licenses', 'audit');
