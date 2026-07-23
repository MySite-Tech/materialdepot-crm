-- Run in the CRM Supabase project > SQL Editor.
-- Shared B2B sales targets (overall monthly goal + per-rep goals).
-- Single config row (id = 'default'); the app reads/upserts it.

create table if not exists b2b_target (
  id                text primary key default 'default',
  monthly_target_l  numeric not null default 120,          -- overall monthly goal, in INR lakhs
  reps              jsonb   not null default '{}'::jsonb,   -- { "<rep>": { revenueTargetL, clientsTarget, onboardingsTarget } }
  updated_at        timestamptz default now()
);

-- Public CRM: client uses the anon key with no Supabase auth, so the policy
-- must allow anon access (an authenticated-only policy would break reads/writes).
alter table b2b_target enable row level security;
create policy "Allow all access" on b2b_target
  for all
  using (true)
  with check (true);

-- Seed the single config row so the first read finds it.
insert into b2b_target (id, monthly_target_l, reps)
values ('default', 120, '{}'::jsonb)
on conflict (id) do nothing;
