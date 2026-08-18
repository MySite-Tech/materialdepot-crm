# materialdepot-crm

Next.js 16 (App Router, Turbopack) + Tailwind CRM portal for Material Depot. One
big client app (`app/App.tsx`, ~3.3k lines) renders every tab; `app/page.tsx` is
just a `<Suspense>` wrapper around it.

`README.md` is a leftover Vite template and describes nothing about this repo —
ignore it.

```bash
npm run dev        # next dev  (a dev server is often ALREADY running on :3000 —
                   #  check before starting; a second one exits with "Another
                   #  next dev server is already running")
npm run build      # next build
npx tsc --noEmit   # typecheck — fast, run this before claiming a change compiles
```

`npx eslint <file>` reports "File ignored because no matching configuration"
for `app/` and `components/` — use `npm run lint` (next lint) instead.

## Git

`origin` = `MySite-Tech/materialdepot-crm` (a fork), `upstream` =
`manishgmr/materialdepot-crm`. Feature work happens on `Installation-Changes`.
A teammate pushes to this branch regularly — **pull before starting.**

## Three backends, and which is which

This is the single most common source of confusion here.

| What | Where | How it's reached |
|---|---|---|
| **Employees, permissions, auth, leads** | Django, `https://api-dev2.materialdepot.in/apiV1` | `lib/mockApi.ts` (`mdFetch`) |
| **CRM's own Supabase** | project `olkkioacgccgsjjlmbhc` | `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`, via `lib/supabase.ts` (only `lib/b2bLeads.ts` uses it) |
| **Site Audit / field-app Supabase** | project `jqrdfnjfxqxrazfkaofm` | `components/site-audit/siteAuditShared.ts` — `sbGet`/`sbPost`/`sbPatch` |

Gotchas:

- `API_BASE_URL` in `lib/mockApi.ts:1` is **hardcoded**. The `API_BASE_URL` line
  in `.env.local` is dead — editing it changes nothing.
- `siteAuditShared.ts` hardcodes the Site Audit URL **and** anon key too. The
  `NEXT_PUBLIC_SITE_AUDIT_*` env vars exist but that module doesn't read them.
- The Site Audit project is shared with the separate `material-depot-site`
  vanilla-JS PWA and **runs with RLS off** — its anon key is public by design.
  Do not "fix" that by enabling RLS; it breaks every read in both apps.
- Two Supabase projects means "the profiles table" is always the Site Audit one.
  Migrations like `site-audit-migration-001-branch-column.sql` must be run
  against `jqrdfnjfxqxrazfkaofm`, not the CRM project.

## Auth, and why a fake session won't work

Login is phone + OTP (`sendOtp` → `verifyOtp`), which stores `jwt_token` /
`refresh_token` in localStorage; the identity itself lives in
`localStorage.materialdepot_user`.

**Any 401/403 from `mdFetch` calls `forceReLogin()`, which deletes
`materialdepot_user` and reloads.** So hand-writing a session into localStorage
to preview the app does not survive: `App.tsx` calls `loginWithPhone()` on
mount, that 401s without a real JWT, and you're bounced to the login screen.

Two ways to see a real dashboard without an OTP:

1. **`/site-audit-view?person=<profile-email>`** — checks only that
   `materialdepot_user` exists, never calls the Django backend. The cheapest way
   to preview any Site Audit dashboard against real data.
2. **Stub the Django host only.** Monkey-patch `window.fetch` to intercept
   `api-dev2.materialdepot.in` (return a token from `/verify-otp/`, a record
   from `/crm/user-profile/`, a roster from `/user-organisation/`, and `200 []`
   for everything else — never a 401, or `forceReLogin` fires), then drive the
   login form. Every Supabase read stays live, so order/attribution numbers are
   real. **Say explicitly which half was stubbed when reporting results.**

React inputs here ignore synthetic `type` events; set values via the native
`HTMLInputElement.prototype.value` setter + `dispatchEvent(new Event('input',
{bubbles:true}))`.

## Tab permissions (`app/App.tsx`)

`resolveAllowedTabs(user)` decides which tabs render:

1. If `user.individualPermissions` is **non-empty**, it wins outright — tabs come
   from `PERMISSION_TAB_ORDER` and `ROLE_TABS` is ignored entirely.
2. Otherwise `ROLE_TABS[role]`, falling back to `DEFAULT_ROLE_TABS`.
3. Then **force-add sets** append regardless of either: `B2B_SALES_ROLES`,
   `APPOINTMENT_TRACKER_ROLES`, `SITE_AUDIT_ROLES`.

Consequence worth remembering: **editing `ROLE_TABS` alone does not reach anyone
who has individual permissions set.** If a tab must be guaranteed for a role,
add a force-add set — that is what the three existing sets are for.

Tab render order is fixed by the literal array in the header JSX, not by the
order tabs were resolved in.

## Site Audit: three overlapping role models

Don't conflate these:

- **`profiles.role`** (Site Audit Supabase) — the field app's own role:
  `site_auditor`, `installer`, `auditor_installer`, `service_mgr`, `bm`, `coe`,
  `branch_mgr`, `store_staff`, `content_team`, `admin`.
- **CRM `permission_name`** (Django) — `sales`, `manager`, `store_manager`,
  `delivery`, `b2b_sales`, `field_worker`, … Mapped to the above by
  `CRM_ROLE_TO_SITE_AUDIT_ROLE` / `siteAuditRoleForCrmRole` in
  `siteAuditShared.ts`. Business-confirmed mapping; `field_worker` is
  deliberately unmapped (nothing distinguishes auditor from installer).
- **`site_audit.*` sub-permissions** — per-user checkboxes in Admin > Users.
  These are an **override**; the CRM role is the default. Almost nobody has one.

Routing lives at the `mainTab === 'siteAudit'` block in `App.tsx`:

- `SITE_AUDIT_OVERSIGHT_ROLES` (`superadmin`/`admin`/`tech`) → `SiteAuditRail`,
  the company-wide console (Users, Role Viewer, every job in every city).
- Everyone else → `SiteAuditOwnDashboard`, their own scoped dashboard.

**This gate is deny-by-default on purpose.** It previously fell through to the
rail whenever a user had no `site_audit.*` sub-permission — the normal state for
a BM — so any widening of Site Audit access must keep non-admins off the rail.

A missing `profiles` row is not a dead end for read-only roles: a BM or store
manager renders from the CRM session alone. Roles that *do* field work
(auditor/installer/SM) still require a real profile, because their jobs are keyed
to it, as is shadowing (`SiteShadowerApp` acts *as* a profile).

## Order attribution: exact matching only

`orderBelongsToBm` (`SiteAuditBmView.tsx`) decides who owns an order, and is
reused by every view that lists orders so they can never disagree. Precedence:

1. `bm_email` present → it **decides alone** (a name match must not override it).
2. Else `phoneKey(row.bm)` vs the person's contact digits.
3. Else exact normalised name, against `BmProfile.name` **and** `aliases`.

`aliases` carries the *other* authoritative name for the same person — the field
profile's name vs the CRM's `f_name + l_name` — because many profiles were
created from a short display name ("Anubhab") while order rows carry the full one
("Anubhab Sarkar"). Both come from records already tied together by an exact
phone match, so this is still exact matching.

**Never introduce fuzzy/similarity matching here.** When a lot of rows fail to
attribute, the question is "which profile or `bm_email` link is missing", not
"should the match be looser". Same rule holds for the COE's imported
`wp_production` rows with a blank `bm`.

Tables (Site Audit Supabase): `audit_orders` (site audits, has `bm_email`),
`install_orders` / `install_orders_slim` view (installations, **no `bm_email`
column** — always resolves by name/phone), `wp_production` (custom wallpaper
runs, has `bm_email`), `profiles`, `app_settings`, `foam_ledger`.

## Known landmines

- **`profiles.branch` exists but is blank for every row.** Anything that scopes
  by store should read CRM Branch Access (`allowedBranches` from `fetchUsers()`)
  and match to profiles by exact phone, treating `profiles.branch` as an
  optional refinement — see `SiteAuditBranchManagerView`.
- **An empty `allowedBranches` means "all branches"**, not "no branches". Reading
  it the other way silently puts every BM in every store.
- **`planSiteAuditRoleSync` short-circuits on `profile.role === target`**, so it
  will never backfill `branch` (or a corrected name) for someone whose role is
  already right — which is all ~87 existing BMs. Fix the short-circuit before
  relying on that sync to populate anything but the role.
- **`SiteAuditPerfView` only computes stats for people who perform jobs**
  (`statsFor` keys off `auditor_email` / `created_by_email`). Feeding it BMs
  renders a wall of zeros that reads as "these people did nothing" — filter its
  `roster` to auditor/installer/SM roles.
- Field staff are not assigned to a store **anywhere** in either system, so
  per-store performance is genuinely unavailable, not just unimplemented.
- Site Audit `profiles` rows double as login identities on the still-live public
  `material-depot-site.vercel.app/Login.html` (email + 4-digit passcode, no OTP).
  Never create a profile with `passcode: null`; use `randomPasscode()`.

## House style

- Comments explain *why*, especially the non-obvious constraint a line encodes —
  match the density of the surrounding file rather than adding narration.
- Prefer soft-gate-and-surface over hard-blocking: when data is missing, say
  what's missing and who fixes it (see the amber notices in
  `SiteAuditBranchManagerView`) instead of rendering a bare empty list.
- Reuse the existing status/stage registries (`install-ops/shared.ts` `STATUS`,
  `coe-ops/wpTrack.ts`) rather than re-declaring labels.
