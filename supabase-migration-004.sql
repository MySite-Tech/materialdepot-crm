create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text default '',
  created_at timestamp with time zone default now()
);

alter table activity_logs enable row level security;

create policy "Allow all access" on activity_logs
  for all
  using (true)
  with check (true);

create index idx_logs_created_at on activity_logs(created_at desc);
create index idx_logs_user_name on activity_logs(user_name);
create index idx_logs_action on activity_logs(action);
