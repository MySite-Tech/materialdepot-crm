-- Run in the NEW project (olkkioacgccgsjjlmbhc) > SQL Editor.
-- Recreates the only live Supabase table the CRM uses: b2b_lead.

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

-- Public CRM: client uses the anon key with no Supabase auth, so the policy
-- must allow anon access (an authenticated-only policy would break all reads/writes).
alter table b2b_lead enable row level security;
create policy "Allow all access" on b2b_lead
  for all
  using (true)
  with check (true);

create index if not exists idx_b2b_lead_pipeline on b2b_lead(pipeline);
create index if not exists idx_b2b_lead_stage    on b2b_lead(pipeline, stage);
create index if not exists idx_b2b_lead_owner     on b2b_lead(owner);
