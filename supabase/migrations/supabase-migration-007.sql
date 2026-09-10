-- Run this in Supabase Dashboard > SQL Editor
-- B2B Sales CRM — single table for all three boards (inbound / outbound / kam).
-- Inbound "New" leads come live from Kylas; every other row is stored here.

create table if not exists b2b_lead (
  id            text primary key default gen_random_uuid()::text,
  pipeline      text not null,              -- 'inbound' | 'outbound' | 'kam'
  stage         text not null,              -- board column (per-pipeline vocabulary)
  kylas_lead_id text unique,                -- inbound only; dedupe/join back to Kylas
  owner         text default '',            -- assigned rep (Hardi / BDA / KAM)
  value         numeric default 0,          -- PI / order value in INR
  meta_data     jsonb default '{}'::jsonb,  -- everything the UI renders
  created_at    text not null default to_char(now(), 'YYYY-MM-DD'),
  updated_at    timestamptz default now()
);

-- Row Level Security (public CRM — no auth yet, same policy as `leads`)
alter table b2b_lead enable row level security;
create policy "Allow all access" on b2b_lead
  for all
  using (true)
  with check (true);

-- Indexes for the common board queries
create index if not exists idx_b2b_lead_pipeline on b2b_lead(pipeline);
create index if not exists idx_b2b_lead_stage    on b2b_lead(pipeline, stage);
create index if not exists idx_b2b_lead_owner     on b2b_lead(owner);
