# components/crm (app shell)

**Covers:** `components/crm/** · lib/api/core/auth.ts · types/crm.ts`

## Purpose
The app shell: login, session restore, and the tab permission gate that decides which of the 14 main tabs a role can see.

## Auth, and why a fake session won't work

Login is phone + OTP (`sendOtp` → `verifyOtp`), which stores `jwt_token` /
`refresh_token` in localStorage; the identity itself lives in
`localStorage.materialdepot_user`.

**Any 401/403 from `mdFetch` calls `forceReLogin()`, which deletes
`materialdepot_user` and reloads.** So hand-writing a session into localStorage
to preview the app does not survive: `components/crm/index.tsx` calls `loginWithPhone()` on
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

## Tab permissions (`components/crm/index.tsx`)

`resolveAllowedTabs(user)` decides which tabs render:

1. If `user.individualPermissions` is **non-empty** it is the WHOLE answer —
   tabs come from `PERMISSION_TAB_ORDER`, and an absent slug means "no".
2. Only if the list is empty/NULL: `ROLE_TABS[role]` (falling back to
   `DEFAULT_ROLE_TABS`) plus the force-add sets (`B2B_SALES_ROLES`,
   `APPOINTMENT_TRACKER_ROLES`, `SITE_AUDIT_ROLES`, storeDisplay). This branch
   is a **bootstrap for un-migrated accounts only**.

**Four roles were added on 2026-09-12** — `team_leader`,
`asst_store_manager`, `cluster_head` and `area_manager` — to `ROLE_OPTIONS`
(so `RoleSelect` in Admin > Users offers them) and to `ROLE_TABS`. They are the
middle of the store ladder in `docs/org-hierarchy/context.md`, and until then
the CRM jumped straight from `sales` to `store_manager` to `manager`.
**Whether the Django permission table accepts them is not verifiable from this
repo.** `roleFromPermission` returns `permission_name` verbatim when it is a
string, so the round trip works the moment Django knows the name, but
`PERMISSION_ID_TO_ROLE` — the numeric fallback — stops at 15 and has none of
them. Assigning one to a real account is the test; nothing here proves it.

`reportCard` was added to `ROLE_TABS.sales` and `ROLE_TABS.store_manager` at the
same time. Both were missing it, so the two roles whose SOP names the report
card by name — "BM performance review" (checker TL) and "TL/AM performance
review" (checker SM) — were the two roles that could not open the tab. **All of
this only reaches accounts with an empty `individualPermissions`**, i.e. the
bootstrap branch below; everyone already migrated needs `crm.report_card`
granted under Admin > Users, which is an admin action and not a code change.
`defaultPermissionsForRole` derives from the same table, so new accounts get the
slug automatically.

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

**One slug is now also checked outside the browser.** `crm.store_checklist` is
re-evaluated server-side in `app/api/store-checklist/route.ts`, so revoking it
takes the data away and not just the tab — every other slug here still gates the
UI only, and hiding a tab hides nothing on the wire. The slug is exported as
`CHECKLIST_PERMISSION_SLUG` from `lib/store-checklist/constants.ts` and imported
into `PERMISSION_TAB_ORDER` rather than written twice, because a rename in one
place would leave the route denying everyone. A tab whose backend must enforce
the same rule should follow that shape; see `docs/api-layer/context.md`.

`siteAudit` additionally force-adds off the caller's **Site Audit `profiles.role`**,
which is fetched async — so that tab can appear a beat after the others. That is
deliberate: caching it would keep showing a tab after a role was revoked in Site
Audit > Users, and a failed fetch leaves the role `undefined` so the CRM role
alone decides (a dropped request can never take a tab away). Nothing forces the
user off a disallowed `?tab=`, so the late arrival can't bounce anyone.

Tab render order is fixed by the literal array in the header JSX, not by the
order tabs were resolved in.
