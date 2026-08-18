-- Run this in the SITE AUDIT Supabase project's SQL Editor:
--   https://jqrdfnjfxqxrazfkaofm.supabase.co
-- NOT the CRM's own Supabase project (this repo has two separate Supabase
-- projects — see components/site-audit/siteAuditShared.ts's SB_URL comment).
--
-- Adds a `branch` column to `profiles`, used to scope the new Branch Manager
-- role (person.role === 'branch_mgr') to only the staff/orders in their own
-- branch. Populated by the "Sync roles from CRM permissions" action in
-- Site Audit > Users from the employee's first/primary CRM allowedBranches
-- entry — see CRM_ROLE_TO_SITE_AUDIT_ROLE / planSiteAuditRoleSync in
-- components/site-audit/siteAuditShared.ts.

alter table profiles add column if not exists branch text;
create index if not exists idx_profiles_branch on profiles(branch);
