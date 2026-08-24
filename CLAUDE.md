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
for `app/` and `components/`, and `npm run lint` is dead too — it still runs
`next lint`, which Next 16 removed ("Invalid project directory provided, no such
directory: .../lint"). There is currently **no working lint command**; `npx tsc
--noEmit` is the only automated check.

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

1. If `user.individualPermissions` is **non-empty** it is the WHOLE answer —
   tabs come from `PERMISSION_TAB_ORDER`, and an absent slug means "no".
2. Only if the list is empty/NULL: `ROLE_TABS[role]` (falling back to
   `DEFAULT_ROLE_TABS`) plus the force-add sets (`B2B_SALES_ROLES`,
   `APPOINTMENT_TRACKER_ROLES`, `SITE_AUDIT_ROLES`, storeDisplay). This branch
   is a **bootstrap for un-migrated accounts only**.

`permission_name` is an HR cost-centre label, not an access level — it says
`tech` for a Service Manager and `admin` for Category/Delivery/Marketing staff —
so nothing may be gated on it. Anything a role must guarantee has to exist as a
slug on those people; **adding a role to a force-add set no longer reaches
anyone who has a permission list**, which is nearly everyone. The 2026-08-20
backfill wrote the slugs for every force-add set (see below).

`?tab=` is validated against `VALID_MAIN_TABS` **and** clamped to the user's own
tabs into `effectiveTab`; every render block keys off `effectiveTab`, never
`mainTab`. Before that, only Admin and Appointment Tracker re-checked at render,
so every other tab was reachable by typing its name.

`siteAudit` additionally force-adds off the caller's **Site Audit `profiles.role`**,
which is fetched async — so that tab can appear a beat after the others. That is
deliberate: caching it would keep showing a tab after a role was revoked in Site
Audit > Users, and a failed fetch leaves the role `undefined` so the CRM role
alone decides (a dropped request can never take a tab away). Nothing forces the
user off a disallowed `?tab=`, so the late arrival can't bounce anyone.

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

Routing lives at the `effectiveTab === 'siteAudit'` block in `App.tsx`:

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

Tables (Site Audit Supabase): `audit_orders` (site audits **and** store
pre-bookings — see the next section; has `bm_email`),
`install_orders` / `install_orders_slim` view (installations, **no `bm_email`
column** — always resolves by name/phone), `wp_production` (custom wallpaper
runs, has `bm_email`), `profiles`, `app_settings`, `foam_ledger`.

## A pre-booking and the audit it becomes are two rows, not one

`Store_Team_App` books a slot before the Kylas enquiry exists, so the two halves
of one job live in separate `audit_orders` rows:

| | `pi` | `po` | status |
|---|---|---|---|
| Store pre-booking | `SRES-<STORE>-<ts>` | the enquiry ID | `slot_reserved` → `slot_converted` |
| The real site audit | that enquiry ID | the MD order id | `pending` → … → `completed` |

**The pre-booking's `po` IS the other row's `pi`.** That exact link — not the
customer name, not the phone — is how the two are tied together; it is what
`Store_Team_App`'s slot-availability check already absorbs bookings by, and what
`dropSupersededPreBookings` (`SiteAuditBmView.tsx`) uses. Name and phone are free
text on the reservation form (the phone is often the *store's* own number, shared
across unrelated bookings), so matching on them merges different customers — the
same rule as **Order attribution** above.

Every list that shows a BM their own orders drops a pre-booking once the audit
exists — either the linked order is provably present, or an SM marked it
`slot_converted` ("service created"). Applied to the RAW rows **before** they are
narrowed to one BM, since whether the audit exists is a question about the whole
table and the audit row may carry a different (or missing) BM link than the
pre-booking. A pre-booking still waiting on its service order stays visible: it
is the only record that the slot was ever held.

The ops/SM views take the opposite approach and filter both statuses out of the
main list with a dedicated pre-booking filter (`audit-ops/Views.tsx`) — that is
deliberate, not an inconsistency. Don't unify them.

## `Array.isArray(rows) ? rows : []` turns a server error into empty data

`sbGet` (`siteAuditShared.ts`) returns `r.json()` **without checking `r.ok`**, so
any 4xx/5xx resolves a PostgREST *error object*, not a throw. Callers that write
`Array.isArray(rows) ? rows : []` therefore render a server error as legitimately
empty — indistinguishable from "nothing matched".

Harmless for a count or a badge. **Dangerous for anything a workflow is gated
on.** It hard-blocked assignment in both ops views (fixed 2026-08-19, commit
`c589ec8`): the auditor/installer rosters load once when the view mounts but the
assignment picker reads them on every drawer open, so one failed fetch emptied
the picker for as long as the view stayed mounted, and the empty state blamed the
city filter for what was a connection problem.

The shape to copy when a load feeds a picker or a gate — see `loadAuditors` in
`SiteAuditOpsView.tsx`:

- a non-array response **throws** (it is a failed load, not an empty roster);
- the last good data survives the failure, so a blip can't blank a working picker;
- retry on the same 8s backoff `loadOrders` uses, self-clearing on success, plus
  the poll and `visibilitychange` **only while the load is known broken** (the
  error flag mirrored into a ref, so the mount-once poll effect reads the current
  value without rebuilding its interval);
- the empty state distinguishes *couldn't load* from *genuinely none* — house
  style is soft-gate-and-surface, and "No auditors in this city" for a dropped
  request sends the SM to the wrong control entirely.

`loadShadowers`, `loadBms` and the deploy-safe `detect*` probes share the pattern
but degrade safely (optional shadower, free-text BM fallback, feature stays
inert). Leave them; they are not gates.

## Known landmines

- **A derived force-add set can still be reverted back to a hand-written one —
  this has now happened twice.** `SITE_AUDIT_ROLES` (`app/App.tsx`) drifted
  from `CRM_ROLE_TO_SITE_AUDIT_ROLE` once before (`delivery` mapped to
  `service_mgr` there but was missing here), was made genuinely derived in
  commit `3bc84a6` (2026-08-19) — `...OVERSIGHT_CRM_ROLES,
  ...Object.keys(CRM_ROLE_TO_SITE_AUDIT_ROLE).filter(k => map[k]),
  'field_worker'`, plus a second independent path via the caller's own field
  profile role — and then a teammate's large same-area rewrite the very next
  day (`a4d5469`, "site audit fixes", introducing the `site_audit.*` slug
  system) silently reverted BOTH: back to a hand-copied literal missing
  `field_worker` entirely, and dropped the field-profile fallback path with
  it. Nobody noticed until three real field workers (site auditors/
  installers) reported no Site Audit tab at all (2026-08-24). Re-fixed the
  same way, but **if `SITE_AUDIT_ROLES` is ever touched again — especially by
  a large unrelated-looking "site audit fixes" commit — diff it against
  `CRM_ROLE_TO_SITE_AUDIT_ROLE` by hand rather than trusting that "it's
  derived" still holds**; a derivation is only as durable as the next person
  editing the same lines knowing it's there. Add a role to the map, never to
  a second hand-written list.
- **`defaultPermissionsForRole` had the identical drift, one level up.** It
  pre-checks the permission checklist in Admin > Users' Add/Edit forms and
  used to compute defaults from `ROLE_TABS` alone, without the three
  `resolveAllowedTabs` force-add sets. For any role missing from `ROLE_TABS`
  (`field_worker`, `delivery_manager`, `post_sales`, `procurement`), opening
  that person's row and hitting Save for an unrelated edit (e.g. a phone
  number) silently saved a permission list missing `crm.site_audit` —
  and once `individualPermissions` is non-empty, `resolveAllowedTabs`'s
  role-based fallback never applies again, so the tab was gone for good. Both
  functions now share one `defaultTabsForRole(role)` helper, so they can't
  diverge. Admin > Users flags any already-saved account this already broke
  (`⚠ Missing Site Audit` in the Permissions column) — that's a one-time
  backfill gap code can't self-heal; re-open Edit and check the box.
- **One phone can have several `profiles` rows** (a field-app account under a
  personal email alongside the company one — Ashish Bhat has exactly this, and
  the company-email row's `contact` is NULL so it can never be resolved by
  phone). `limit=1` on a `contact=eq.` lookup picks an arbitrary one; use
  `pickOwnProfile`, which prefers the row naming a renderable dashboard.
- **13 of 129 profiles have a NULL `contact`.** Nothing that keys off phone —
  own-dashboard resolution, payouts, BM attribution — can ever reach them; the
  Users screen already surfaces this as its top amber notice.
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
- **A service manager must only ever see EXECUTION analytics.** In `material-depot-site`,
  `Admin.html`'s Analytics is five tabs (Category, Execution, Week on week, Penetration,
  Targets) and only Execution is field-ops; the rest carry revenue, AOV and store targets, and
  a `service_mgr` session is pinned to Execution in three places (forced in `renderAnalytics`,
  filtered out of the tab bar, and re-checked in `anSetTab`). **This repo has no commercial
  analytics at all** — `SiteAuditAnalyticsView.tsx` is the pre-V3 execution-only port — so
  there is currently nothing to gate here. If those tabs (or a Metabase-backed equivalent) are
  ever ported into the CRM, the role gate has to come with them, or every service manager gets
  the order book. Related: this repo's Role Viewer renders each role's components inline rather
  than copying the original's iframe + localStorage impersonation, which is also why the
  2026-08-18 preview-leak bug in that app (its note 112) has no counterpart here.
- Site Audit `profiles` rows double as login identities on the still-live public
  `material-depot-site.vercel.app/Login.html` (email + 4-digit passcode, no OTP).
  Never create a profile with `passcode: null`; use `randomPasscode()`.
- **A reference list loaded once on mount, but read on every drawer open, breaks
  permanently on one failed fetch.** That is what killed auditor assignment;
  `loadOrders`-style retry + a self-describing empty state is the fix, not a
  louder `console.error`. See the `Array.isArray` section above.
- **`SiteAuditBranchManagerView`'s `ROLLUP_AUDIT_COLS` is deliberately narrower
  than `AUDIT_COLS`** (dropping `log`/`skus` cut this list from 1.9 MB per poll to
  107 KB) — but it must keep `po`, which is never rendered and exists only so
  `dropSupersededPreBookings` can tell a held slot from the audit it became.

## House style

- Comments explain *why*, especially the non-obvious constraint a line encodes —
  match the density of the surrounding file rather than adding narration.
- Prefer soft-gate-and-surface over hard-blocking: when data is missing, say
  what's missing and who fixes it (see the amber notices in
  `SiteAuditBranchManagerView`) instead of rendering a bare empty list.
- Reuse the existing status/stage registries (`install-ops/shared.ts` `STATUS`,
  `coe-ops/wpTrack.ts`) rather than re-declaring labels.
