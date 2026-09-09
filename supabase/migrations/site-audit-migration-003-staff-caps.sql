-- Run this in the SITE AUDIT Supabase project's SQL Editor:
--   https://jqrdfnjfxqxrazfkaofm.supabase.co
-- NOT the CRM's own Supabase project (this repo has two separate Supabase
-- projects — see components/site-audit/siteAuditShared.ts's SB_URL comment).
--
-- Moves per-staff daily capacity out of the SM's browser and into the DB.
--
-- Until 2026-09-02 auditor caps lived in localStorage under `md_audit_caps`,
-- which made them device-local: an SM setting a cap on their laptop was
-- invisible to the other SM, to their own phone, and — the reason this
-- mattered — to the public Store Team kiosk, which never read caps at all and
-- instead counted raw headcount. Installers had no cap UI whatsoever; their
-- capacity was hardcoded per type (flooring 1/day, wallpaper 3 slots/day,
-- wall panels 1/day).
--
--   daily_cap      per-person default, max jobs per day. NULL = fall back to
--                  the code default (3 for auditors; the per-type constant for
--                  installers), so every existing row keeps today's behaviour
--                  until an SM actually sets a number.
--   cap_overrides  per-date exceptions, {"2026-09-05": 0, "2026-09-08": 5}.
--                  A date present here wins over daily_cap. 0 = unavailable
--                  that day, which removes the person from availability
--                  everywhere including the kiosk's slots-left count.
--
-- Both are additive and nullable — the app reads them with defaults and works
-- unchanged if this migration has not been run yet.

alter table profiles add column if not exists daily_cap int;
alter table profiles add column if not exists cap_overrides jsonb not null default '{}'::jsonb;

-- Guard against a typo'd cap becoming negative capacity.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_daily_cap_nonneg') then
    alter table profiles add constraint profiles_daily_cap_nonneg
      check (daily_cap is null or daily_cap >= 0);
  end if;
end $$;
