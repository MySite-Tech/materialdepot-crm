-- Rota planner storage. Replaces the JSON blob that used to live on Kylas lead
-- 39871021's `cfResourceplanjson` field.
--
-- One row per branch is the whole point: the old single-blob layout meant every
-- save PUT the author's entire snapshot of all six branches, so a stale tab
-- silently overwrote other branches' rosters (last-write-wins across the
-- company). A per-branch primary key makes that physically impossible.

create table if not exists rota_plan (
  branch      text primary key,
  members     jsonb       not null default '[]'::jsonb,
  weeks       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Seed the six known branches so a GET before any save still returns all of
-- them (the API tolerates missing rows, but this keeps reads uniform).
insert into rota_plan (branch) values
  ('JP Nagar'), ('Yelahanka'), ('Whitefield'),
  ('Gachibowli'), ('Kompally'), ('HSR')
on conflict (branch) do nothing;

-- The API route is server-side and uses the service-role key, which bypasses
-- RLS. Enable RLS with no permissive policy so the anon key (which is exposed
-- to the browser via NEXT_PUBLIC_SUPABASE_ANON_KEY) cannot read or write this
-- table directly.
alter table rota_plan enable row level security;
