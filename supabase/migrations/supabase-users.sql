-- Run this in Supabase Dashboard > SQL Editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  role text default 'sales',
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table users enable row level security;

-- Allow all operations for anon users (same as leads table)
create policy "Allow all access" on users
  for all
  using (true)
  with check (true);

-- Index for code lookup
create index if not exists idx_users_code on users(code);

-- Sample users with unique 4-digit codes
insert into users (name, code, role) values
  ('Arjun Mehta', '1001', 'sales'),
  ('Priya Sharma', '1002', 'sales'),
  ('Rahul Verma', '1003', 'sales'),
  ('Sneha Patel', '1004', 'sales'),
  ('Vikram Singh', '1005', 'manager'),
  ('Deepa Nair', '1006', 'sales'),
  ('Karan Gupta', '1007', 'sales'),
  ('Ananya Reddy', '1008', 'admin');
