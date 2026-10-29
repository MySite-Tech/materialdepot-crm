-- Run in the CRM project (olkkioacgccgsjjlmbhc) > SQL Editor.
-- B2B team membership and the inbound lead assignment log. Read and written only
-- by app/api/b2b/* with the service role, so RLS is on with no policy.

create table if not exists b2b_team_member (
  phone         text primary key,
  name          text not null,
  team          text not null check (team in ('inbound', 'outreach', 'kam')),
  kylas_user_id bigint,
  kylas_name    text,
  in_rotation   boolean not null default true,
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create table if not exists b2b_lead_assignment (
  id              bigserial primary key,
  lead_id         text not null,
  lead_created_at timestamptz,
  team            text not null default 'inbound',
  kind            text not null check (kind in ('round_robin', 'reassign')),
  to_kylas_id     bigint not null,
  to_name         text not null,
  from_kylas_id   bigint,
  reason          text,
  by_name         text not null,
  at              timestamptz not null default now()
);

create unique index if not exists b2b_lead_assignment_round_robin_once
  on b2b_lead_assignment (lead_id) where kind = 'round_robin';
create index if not exists b2b_lead_assignment_lead    on b2b_lead_assignment (lead_id, at desc);
create index if not exists b2b_lead_assignment_to      on b2b_lead_assignment (to_kylas_id, at desc);
create index if not exists b2b_lead_assignment_created on b2b_lead_assignment (lead_created_at);

alter table b2b_team_member     enable row level security;
alter table b2b_lead_assignment enable row level security;
