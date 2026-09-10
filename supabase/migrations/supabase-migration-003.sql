-- Run this in Supabase Dashboard > SQL Editor

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamp with time zone default now()
);

alter table branches enable row level security;

create policy "Allow all access" on branches
  for all
  using (true)
  with check (true);

-- Seed with existing branches
insert into branches (name) values
  ('JP Nagar'),
  ('Whitefield'),
  ('Yelankha'),
  ('HQ');
