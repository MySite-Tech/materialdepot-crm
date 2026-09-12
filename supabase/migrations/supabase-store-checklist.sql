-- Run in the CRM's own project (olkkioacgccgsjjlmbhc) > SQL Editor.
-- NOT the Site Audit project (jqrdfnjfxqxrazfkaofm) — this table is read through
-- NEXT_PUBLIC_SUPABASE_URL, and the two projects share several table names.
--
-- Daily store (EC) opening / housekeeping / working-hours / closing checklist.
-- Replaces the paper sheet each store's receptionist filled every morning.
--
-- One row per (store, day) is the whole point: the sheet is one page per store
-- per day, and a composite primary key makes it physically impossible for one
-- store's tab to overwrite another's — the same reasoning as rota_plan.sql.
--
-- `items` is keyed by the item ids in lib/store-checklist/constants.ts:
--   { "op_front_door": { "v": "yes", "c": "", "at": "<iso>", "by": "<name>" } }
-- v is 'yes' | 'no' | 'na'. Those ids are stored data — renaming one orphans
-- every historical mark under the old key.

create table if not exists store_checklist (
  store_code  text        not null,
  check_date  date        not null,
  items       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (store_code, check_date)
);

create index if not exists store_checklist_date_idx on store_checklist (check_date desc);

-- Marks are merged, never replaced. Two people (receptionist in the morning,
-- store manager at closing) mark the same row on the same day, and a
-- read-modify-write from either tab would drop the other's marks. `items ||
-- excluded.items` is a top-level jsonb merge, and every item id maps to a whole
-- object, so a merge overwrites exactly the ids in this payload.
create or replace function store_checklist_mark(
  p_store text,
  p_date  date,
  p_marks jsonb,
  p_by    text
) returns store_checklist
language sql
as $$
  insert into store_checklist (store_code, check_date, items, updated_by, updated_at)
  values (p_store, p_date, p_marks, p_by, now())
  on conflict (store_code, check_date) do update
    set items      = store_checklist.items || excluded.items,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning *;
$$;

-- Every read and write goes through app/api/store-checklist, which uses the
-- service-role key. Enable RLS with no permissive policy so the anon key
-- (exposed to the browser via NEXT_PUBLIC_SUPABASE_ANON_KEY) can neither read
-- another store's compliance history nor forge a mark.
alter table store_checklist enable row level security;

-- The function is SECURITY INVOKER, so RLS above already blocks an anon caller
-- from writing through /rest/v1/rpc/. Revoking execute makes that explicit
-- rather than dependent on the table's policy set staying empty.
revoke execute on function store_checklist_mark(text, date, jsonb, text) from anon, authenticated;
