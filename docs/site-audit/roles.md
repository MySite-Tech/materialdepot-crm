*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## Site Audit: three overlapping role models

Don't conflate these:

- **`profiles.role`** (Site Audit Supabase) — the field app's own role:
  `site_auditor`, `installer`, `auditor_installer`, `service_mgr`, `bm`, `coe`,
  `branch_mgr`, `store_staff`, `content_team`, `admin`.
- **CRM `permission_name`** (Django) — `sales`, `manager`, `store_manager`,
  `delivery`, `b2b_sales`, `field_worker`, … Mapped to the above by
  `CRM_ROLE_TO_SITE_AUDIT_ROLE` / `siteAuditRoleForCrmRole` in
  `components/site-audit/shared/`. Business-confirmed mapping; `field_worker` is
  deliberately unmapped (nothing distinguishes auditor from installer) — meaning
  the role *sync* won't touch them, but it still force-adds the Site Audit tab,
  and their own `profiles.role` picks which app they land in.
- **`site_audit.*` sub-permissions** — per-user checkboxes in Admin > Users.
  These are now the ONLY thing that grants a Site Audit view; the CRM role is
  not consulted. Slugs: `site_audit.admin` (oversight rail), `.bm`,
  `.branch_mgr`, `.service_manager`, `.site_auditor`, `.installer`,
  `.auditor_installer`, `.coe`. `site_audit.admin` and `.branch_mgr` were added
  2026-08-20 — before that oversight was the *absence* of a sub-role combined
  with `permission_name in (admin, superadmin, tech)`, which is how 26 accounts
  that were never granted `crm.site_audit` reached the company-wide rail, and
  `branch_mgr` had no slug at all.

Routing lives at the `effectiveTab === 'siteAudit'` block in `components/crm/index.tsx`:

- `site_audit.admin` → `SiteAuditRail`, the company-wide console (Users, Role
  Viewer, every job in every city).
- Any other `site_audit.*` slug → `SiteAuditOwnDashboard`, their own scoped
  dashboard.
- No slug → the dashboard's soft-gate message, NOT the rail.

**This gate is deny-by-default on purpose**, and it must stay keyed to the slug.
Twice now the fallback has been the bug: first falling through to the rail when
a user had no sub-role, then deriving the sub-role from `permission_name`.
`/site-audit-view?person=` renders someone else's dashboard, so it requires
`site_audit.admin` too — a session alone was never authorisation, and profile
emails are enumerable through the field app's public anon key.

A missing `profiles` row is not a dead end for read-only roles: a BM or store
manager renders from the CRM session alone. Roles that *do* field work
(auditor/installer/SM) still require a real profile, because their jobs are keyed
to it, as is shadowing (`SiteShadowerApp` acts *as* a profile).
