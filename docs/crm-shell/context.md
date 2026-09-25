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

1. **`/site-audit-view?person=<profile-email>`** — never calls the Django
   backend. The cheapest way to preview any Site Audit dashboard against real
   data. It needs more than a `materialdepot_user` key existing, though: viewing
   *someone else's* dashboard is gated on `isSiteAuditOversightRole`, which
   accepts **only** `site_audit.admin` in `individualPermissions` — any other
   `site_audit.*` slug renders "This preview is limited to Site Audit oversight
   accounts." (hit 2026-09-23 with `site_audit.service_mgr`).
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

## The lead drawer re-resolves its row, and must do it by ticket

`CrmModals` (`components/crm/shell/modals.tsx`) does not render `drawerLead`
directly — it re-reads the row out of `leads` so the drawer follows later
refreshes. That lookup used `l.id === drawerLead.id`, and a lead's `id` is the
cart number, which every deal ticket on that cart shares: clicking the "In Cart"
row opened a lost sibling instead. It now goes through `findLeadRow`/
`isSameLeadRow` (`components/crm/utils.ts`), which match on `ticketId` and fall
back to `id + clientPhone` only for a lead being created, which has no ticket
yet. The two `setLeads` maps in `onImmediateSave` use the same helper — matching
those on `id + clientPhone` wrote one date edit to every sibling row.

The same rule binds the `DateEditPopup` beside it: the save handler resolves its
row by ticket, but the popup's *pre-filled* dates come from a separate
`findLeadRow` in `CrmModals`, and while that one matched on `id` the operator was
editing against a sibling's values and saving them onto the right row. The
drawer's remarks/visits effect in `components/crm/index.tsx` carries `ticketId`
in its dependency array for the same reason — sibling rows share `id` **and**
`clientPhone`, so without it, switching between two deal tickets on one cart
never refetches and the drawer keeps the first row's remarks.


## The Leads tab's Salesperson filter is branch-scoped, and the branch filter never widens

`availableBMs` (`hooks/use-leads-view.ts`) used to be the entire
`/user-organisation/` roster, so a store manager could pick a B2B rep — or
anyone from another store — and get their carts under their own branch. It goes
through `bmsInBranchScope` (`utils.ts`) now: a user is offered when the caller
has no branch scope at all (admin, or the empty `allowedBranches` that means
"all branches"), when the *user's* own `allowedBranches` is empty, or when the
two lists overlap. `buildLeadsQuery` clamps `personFilter` to that same list
before building `bm=`, so the dropdown and the request cannot disagree.

`effectiveLeadBranches` is the one place that decides what `branch=` carries.
**An empty result must never reach the wire** — `branch: '' || undefined` drops
the param and Django then answers for every branch, which is the opposite of
what a scoped user asked for. When the caller has allowed branches and their
selection does not intersect them, it falls back to the caller's own branches;
only a genuinely unscoped caller with nothing selected sends no `branch` at all.

`leads/csv/actions.ts` builds its export query from `buildLeadsQuery` rather
than repeating the derivation — it used to carry a second copy, which meant the
export kept both holes after the tab was fixed.

**`/crm/leads/` does not always honour `branch`.** Confirmed 2026-09-23 against
production: carts owned by a B2B-only rep came back under a BASAVESHWARA NAGAR
selection, and nothing in the Django schema links them to that store. Until the
backend is fixed, `offScopeLeadBranches` compares each returned row's `branch`
against the requested set and `LeadsPanel` renders an amber notice naming what
leaked — the rows are still shown, because the stat cards above them are the
backend's counts and silently dropping rows would make the two disagree. See
`docs/landmines.md` for the full account and the Branch Access data fix that
goes with it.
