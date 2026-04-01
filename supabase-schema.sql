-- Run this in Supabase Dashboard > SQL Editor

create table if not exists leads (
  id text primary key,
  created_at text not null default to_char(now(), 'YYYY-MM-DD'),
  client_name text default '',
  client_phone text default '',
  assigned_to text not null,
  branch text not null,
  status text not null,
  lost_reason text default '',
  cart_value numeric default 0,
  cart_items jsonb default '[]'::jsonb,
  follow_up_date text default '',
  closure_date text default '',
  remarks jsonb default '[]'::jsonb,
  visits jsonb default '[]'::jsonb,
  first_visit_date text default '',
  latest_visit_date text default '',
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table leads enable row level security;

-- Allow all operations for anon users (public CRM - no auth yet)
create policy "Allow all access" on leads
  for all
  using (true)
  with check (true);

-- Indexes for common queries
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_assigned_to on leads(assigned_to);
create index if not exists idx_leads_branch on leads(branch);
create index if not exists idx_leads_first_visit on leads(first_visit_date);
create index if not exists idx_leads_latest_visit on leads(latest_visit_date);
