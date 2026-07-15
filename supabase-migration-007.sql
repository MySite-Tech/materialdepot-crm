-- Migration 007: Category Follow Up overlay table
-- Stores manager follow-up state (follow-up/closure dates, status, remarks) for
-- abandoned-cart rows sourced live from the Metabase "Category Follow Up" sheet.
-- Kept separate from the `leads` table so these carts never bleed into the
-- sales-pipeline stats/exports. Keyed by cart_number.
-- Run this in Supabase Dashboard > SQL Editor.

create table if not exists category_followups (
  cart_number    text primary key,
  client_phone   text default '',
  assigned_to    text default '',
  branch         text default '',
  status         text default 'In Cart',
  lost_reason    text default '',
  follow_up_date text default '',
  closure_date   text default '',
  remarks        jsonb default '[]'::jsonb,
  updated_at     timestamp with time zone default now()
);

-- Enable Row Level Security (public CRM - no auth yet), matching `leads`.
alter table category_followups enable row level security;

create policy "Allow all access" on category_followups
  for all
  using (true)
  with check (true);

create index if not exists idx_catfu_branch on category_followups(branch);
create index if not exists idx_catfu_status on category_followups(status);
