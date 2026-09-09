-- Run this in the SITE AUDIT Supabase project's SQL Editor:
--   https://jqrdfnjfxqxrazfkaofm.supabase.co
-- NOT the CRM's own Supabase project (this repo has two separate Supabase
-- projects — see components/site-audit/siteAuditShared.ts's SB_URL comment).
--
-- The Branch Manager role ('branch_mgr') was added to the app on 2026-08-14
-- (siteAuditShared.ts's ROLES/CRM_ROLE_TO_SITE_AUDIT_ROLE, SiteAuditUsersView's
-- Add-User ROLE_OPTIONS dropdown) but `profiles_role_check` — a plain CHECK
-- constraint on profiles.role, not a Postgres enum type — was never widened to
-- allow it. Every attempt to create or correct a profile to branch_mgr has
-- been failing at the DB layer since: both the "Add New User" form (sbPost
-- into profiles) and the "Sync roles from CRM permissions" bulk action
-- (sbPatch on an existing profile) insert/update role='branch_mgr' and get
-- rejected with "new row for relation \"profiles\" violates check constraint
-- \"profiles_role_check\"" — which is why the Branch Manager role card has
-- stayed at 0 members for the 6 people (Asiya, Vidyasagar, Harsh, Sowbik,
-- Padmashree, Manish Tiwari) whose CRM permission (manager/store_manager)
-- maps to it.
--
-- Recreates the constraint with the full role list already documented in
-- this repo's CLAUDE.md (site_auditor, installer, auditor_installer,
-- service_mgr, bm, coe, branch_mgr, store_staff, content_team, admin) —
-- every value currently live in the table is in this list, so existing rows
-- are unaffected; branch_mgr is the only newly-allowed value.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (
  role in (
    'site_auditor', 'installer', 'auditor_installer', 'service_mgr', 'bm',
    'coe', 'branch_mgr', 'store_staff', 'content_team', 'admin'
  )
);
