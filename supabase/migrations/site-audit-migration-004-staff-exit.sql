-- Run this in the SITE AUDIT Supabase project's SQL Editor:
--   https://jqrdfnjfxqxrazfkaofm.supabase.co
-- NOT the CRM's own Supabase project (this repo has two separate Supabase
-- projects — see components/site-audit/siteAuditShared.ts's SB_URL comment).
--
-- ── Why this file also repeats migration 003 ──────────────────────────────
-- On 2026-09-03 the live `profiles` table was probed and BOTH `daily_cap` and
-- `cap_overrides` answered `42703 column does not exist`: migration 003 was
-- written and committed but never actually run. The caps feature shipped in
-- `4f431b0` has therefore been inert in production — `rosterSelect()` probes,
-- gets "missing", and quietly degrades every cap to its default, so an SM
-- setting a number saw it accepted and lost on reload. Its two statements are
-- repeated below verbatim; they are `if not exists`, so running this file is
-- safe whether or not 003 ever landed.
--
-- ── Staff exit (attrition) ────────────────────────────────────────────────
-- Removing a field-app profile used to be a hard DELETE, which is why nobody
-- could answer "how many auditors left this quarter" — the row was simply
-- gone. Worse, it made removal something an admin did rarely and nervously,
-- so the roster kept accumulating people who had left months earlier and the
-- assignment pickers offered them jobs.
--
-- Removal is now a soft delete, so the person disappears from every roster,
-- picker and availability count the moment they are marked as having left,
-- while the row survives as the attrition record.
--
--   deleted_at   when they stopped being staff. NULL = current staff. This is
--                the ONLY thing any roster read filters on.
--   deleted_by   the email of whoever removed them (a service manager or an
--                admin), so an accidental removal has an owner to ask.
--   exit_reason  free text picked from a short list in the UI ("Resigned",
--                "Terminated", "Contract ended", …) — what the attrition rate
--                is actually broken down by.
--
-- All three are additive and nullable, and every read goes through
-- `exitSelect()` / `activeStaffFilter()` in siteAuditShared.ts, which probe
-- once and fall back to the pre-migration behaviour when the columns are
-- absent. So the app keeps working unchanged if this file has not been run —
-- it just cannot retire anybody yet, and says so in the UI rather than
-- silently hard-deleting them.

-- ── from migration 003 (never run in production — see above) ──────────────
alter table profiles add column if not exists daily_cap int;
alter table profiles add column if not exists cap_overrides jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_daily_cap_nonneg') then
    alter table profiles add constraint profiles_daily_cap_nonneg
      check (daily_cap is null or daily_cap >= 0);
  end if;
end $$;

-- ── staff exit ────────────────────────────────────────────────────────────
alter table profiles add column if not exists deleted_at  timestamptz;
alter table profiles add column if not exists deleted_by  text;
alter table profiles add column if not exists exit_reason text;

-- Every roster read is `deleted_at is null`, which is most of the traffic
-- against this table.
create index if not exists profiles_active_idx on profiles (deleted_at) where deleted_at is null;

-- A reason without a date would be an orphan, and a date is what every read
-- keys off — so the pair has to move together.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_exit_reason_needs_date') then
    alter table profiles add constraint profiles_exit_reason_needs_date
      check (exit_reason is null or deleted_at is not null);
  end if;
end $$;
