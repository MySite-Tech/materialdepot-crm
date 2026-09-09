# components/site-audit

**Covers:** `components/site-audit/** · app/site-audit-view · app/job-card · app/api/site-audit/**`

## Purpose
Site audit and installation operations: the field apps (auditor, installer, shadower), audit-ops, install-ops, COE ops, staff roster and capacity, and the oversight views. Largest module in the repo (~29.6k lines).

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

## Staff come and go, and the roster used to be the only record

One field staff member exists twice and has to, because the two halves are
keyed differently — `profiles` (Site Audit Supabase, EMAIL-keyed) is what the
field PWAs log into, `UserOrganisation` (Django, PHONE-keyed) is what the CRM
logs into and the only table `/login-otp/?contact=` will send an OTP for.
`profiles.contact` is the sole bridge. `components/site-audit/staff/staff-directory.ts` is the one place that
writes both sides; `components/site-audit/staff/staff-modals.tsx` holds the three modals (add / retire /
restore) every surface shares.

**Adding.** There were two add-staff forms with separate role lists, separate
validation and separate hand-copied permission maps: the Audit dashboard's
offered Site Auditor and Auditor + Installer only, so an SM in the audit console
could not create a plain installer at all and had to know to cross to the
Install dashboard. Both are now `AddFieldStaffModal`, and it names the dashboard
the new hire will appear on — the two SM rosters are `site_auditor +
auditor_installer` and `installer + auditor_installer`, so adding an installer
from the audit console works and is meant to, but the person shows up on the
*other* screen and without that line the add read as a no-op.

**The permission map is DERIVED now, in one direction each.**
`SITE_AUDIT_ROLE_TO_PERMISSION` / `crmPermissionsForSiteAuditRole()` invert
`SITE_AUDIT_PERMISSION_TO_ROLE` instead of restating it. Three hand-written
copies of that table existed (`SiteAuditUsersView`, `audit-ops/Overlays`,
`install-ops/Overlays`) and one had already drifted — which is exactly how
`SITE_AUDIT_ROLES` and `defaultPermissionsForRole` broke twice (see Known
landmines). Add a role to `SITE_AUDIT_PERMISSION_TO_ROLE` and both directions
learn it at once.

**Removing is a SOFT delete, and the SM can do it.** It used to be `sbDel`,
admin-only, from one screen, and its own confirm text admitted the gap: it
deleted the field-app profile and left the CRM login alive. Two things followed —
nobody could answer "how many installers left this quarter" because the row was
gone, and because deletion was irreversible it was avoided, so the roster kept
people who had left months earlier and the assignment pickers went on offering
them jobs. `profiles.deleted_at` / `deleted_by` / `exit_reason`
(`site-audit-migration-004-staff-exit.sql`) replace it. `deleted_at is null` is
the ONLY predicate any read uses; the reason comes from the fixed
`EXIT_REASONS` list so the attrition breakdown can't fragment into fourteen
spellings of "resigned"; `deleted_by` gives an accidental removal an owner to
ask. Restore is one click and clears the reason.

**Neither migration has been run yet as of 2026-09-03** (re-probed after the
work was pushed: `daily_cap` and `deleted_at` both still answer 42703). So on
the branch today the Remove control is disabled with a tooltip naming the file,
the Former staff view is hidden, and caps still degrade to their defaults —
everything else works unchanged. Running
`site-audit-migration-004-staff-exit.sql` is what switches all of it on, and it
is additive and idempotent, so it can be run before or after the deploy. Note
the probe latches per page load, so anyone with the app already open needs a
refresh before Remove becomes enabled.

**Both column sets are probe-gated, and it is the same guard for the same
reason.** `rosterQuery(cols)` bundles `rosterSelect` (caps, migration 003) and
`activeStaffFilter` (exit, 004): PostgREST fails the WHOLE select with `42703`
on a missing column, and this is the query the assignment pickers and the public
kiosk's slots-left count depend on, so naming `deleted_at` unconditionally would
take out every roster in both field apps. Verified against the live DB on
2026-09-03, where the columns genuinely do not exist yet: the bare roster query
returns 200, the naive `&deleted_at=is.null` returns 42703. An *unknown* probe
answer (network blip) resolves to "absent" — pre-migration behaviour — never to
"present", which would turn a dropped request into an empty roster. **Never
write the filter inline; always append `activeStaffFilter()`.** `retireProfile`
throws `ExitColumnsMissing` rather than falling back to a hard delete: a hard
delete is not a degraded soft delete, it destroys the record being asked for.
The UI probes up front and disables Remove with a tooltip naming the migration.

**Which reads exclude people who have left, and which deliberately don't.**
Getting this backwards silently breaks historic data, so each keep-them site
carries a comment saying so:

| Excludes retired | Keeps retired |
|---|---|
| both SM rosters + assignment pickers | `FoamPayoutViews` pay rates (a leaver's final payout uses the same override) |
| the kiosk's availability + slots-left | `SiteAuditJobsView`'s email→name map (else a leaver's past jobs render with a blank assignee) |
| `SiteAuditLiveView` (a leaver has a stale pin, not a location) | `SiteAuditBranchManagerView`'s phone→profile identity map (else their historic orders unattribute) |
| `SiteAuditPerfView` (else a wall of zeros reads as "did nothing") | |
| Role Viewer's person picker, the kiosk's BM picker, shadower pools | |

`pickOwnProfile` also skips retired rows and returns null when they all are, so
someone marked as no longer staff cannot be handed a field dashboard even if the
Django deactivation (a separate write, which can fail alone) outlives the
removal. `ownProfileQuery` is async purely because of the probe — both callers
await the same function, so they still produce the same string and `sbGet`'s
cache still collapses them into one request.

**`AppUser.active` is not optional to check.** Retiring someone deactivates
their CRM login (`status: false`, never a delete — Admin > Users still needs to
manage the account and their past orders must keep resolving to a real name).
`_mapUserOrg` reads it back as `active`. Anything deriving ACCESS or a live
roster from `fetchUsers()` must filter `active !== false`:
`SiteAuditBranchManagerView` always did; `SiteAuditUsersView`'s CRM-link check
and `SiteAuditOpsView`'s BM picker did not, so a deactivated account still read
as "✓ CRM linked" and was still offered for new order attribution. Both fixed
2026-09-03. Note `lib/api/crm/users.ts`'s `updateUser` renames `active` → `status` on
the way out — the repo's name and the backend column differ, and before that
rename the key rode through untouched and Django ignored it, so deactivating an
account looked like it worked and changed nothing.

**Why people were "not reflected in our system".** A profile with a real phone
and no CRM login cannot be sent an OTP, so the person cannot sign into the CRM
at all however healthy their field-app profile looks (Mohd Musaddique,
`8318839661`, was exactly this: `installer`/wallpaper/Hyderabad, `contact` set,
passcode set, field app working, no `UserOrganisation` row). The systemic source
is the legacy PWA — all three of its add-staff forms write a `profiles` row and
nothing else, with no `contact` and no CRM user:
`SM_Install_Dashboard.html:3109`, `SM_Audit_Dashboard.html:2553`,
`Admin.html:707`. That is also why 14 live profiles have no phone number at all.
The Users tab's amber notice used to state the count and stop, leaving the only
fix buried inside one person's Edit form; it now lists exactly who and creates
the missing logins in bulk (or one at a time, from a Fix button on the row) with
the same two permissions a fresh add grants. **Anyone added through the legacy
apps will keep arriving in that list until those three forms are fixed** — and
per the field-ops split, that repo is read-only from here.

## Order attribution: exact matching only

`orderBelongsToBm` (`components/site-audit/views/bm/index.tsx`) decides who owns an order, and is
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

**Write `bm_email` at the point the BM is chosen — the phone is the join.**
196 audit orders reached 2026-08-31 with `bm_email` NULL because none of the
three writers set it: the auto-import dropped the `bm.contact` the backend
sends (`_site_audit_serialize_bm`), and the Add Order overlay + the drawer's BM
assign guard on `match.email` while their BM list (`fetchUsers()`, the CRM
roster) has no email field at all — so the guard was always false and only a
name was written. All three now resolve it through
`fetchBmEmailsByPhone()` (`shared/staff/bm-link.ts`): `phoneKey` → the single
`profiles` row with `role='bm'` carrying that number, ambiguous numbers dropped.

Do NOT reach for `profiles.name` to close that gap. Every live BM profile came
from the CRM sync holding a FIRST NAME ("Anubhab", "Shaikh") while orders carry
the full one ("Anubhab Sarkar") — name matching against profiles resolved 0 of
the 196. The Users-view backfill goes order name → exactly one CRM roster
employee with that exact name (the roster has `f_name + l_name`, the same
string the order got) → their phone → the BM profile. Two exact hops, no
similarity, and store names ("Whitefield") and "Anubhab/Zaid" match nothing and
stay in the by-hand list, which is correct.

`bm_email` is only on `audit_orders`; never add it to an `install_orders`
payload — PostgREST rejects the whole insert on an unknown column.

**A BM with no `profiles` row is unlinkable by construction** — `bm_email` has
nothing to point at, no picker lists them, no backfill resolves them. The Users
tab surfaces active CRM users whose permission maps to `bm` and who have no
profile (19 on 2026-08-31) and creates the accounts on request. This is the ONE
exception to "don't provision field-app logins for desk staff": a BM profile is
the join target order attribution needs. Branch managers and service managers
still get nothing — they render from their CRM session and slug.

The store pre-booking sheet picks the BM from `profiles` instead of taking free
text, because that public kiosk route was the single biggest source of
unattributable names (66 of 128 rows: `Janvi` for the account `Jhanvi`, `Soheb`,
`Beema`, and the store's own name when the field was optional).

**The name on the order is not the attribution — the enquiry's owner is.**
`components/site-audit/data/resolve-bm-from-backend.ts` reads `bm: {name, contact}` off the jobs feed
(`/api/site-audit/install-pos`, the one the auto-import already pages) keyed by
`estimate_lead_id`, and links on phone. This needs NO backend endpoint and no
judgement about whether someone "is a BM" — being the estimate's owner is the
whole answer, and `permission_name` disagrees with it constantly (Harsh Singh:
~1500 clients, label `manager`). The enquiry id is in `pi` for CRM rows and in
`po` for store pre-bookings, whose `pi` is the generated `SRES-…` slot id.
`autoLinkBmsFromRows` runs this inside the auto-import reconcile from the page
of jobs already in hand — no extra request, no button — so new rows self-repair;
the Users-tab button is only for backlog older than a reconcile page.

**The phone is the identity; `bm_email` is only how it is stored.** When the
owner has no field-app account, writers record the synthetic address that
ENCODES their number (`crm.<10 digits>@site-audit.internal`) rather than
recording nothing, and `orderBelongsToBm` compares `bmPhoneOfOrder(row)` against
the viewer's `phoneKey(contact)` FIRST. A BM's CRM session knows their number
long before anyone creates them a profile, so attribution no longer waits on an
account existing — and when the account is created it lands on that very same
synthetic address, so no row needs rewriting. Creating the account is now about
giving someone a dashboard, not about making their orders findable. Phone is
required when adding a Site Audit user for the same reason.

Tables (Site Audit Supabase): `audit_orders` (site audits **and** store
pre-bookings — see the next section; has `bm_email`),
`install_orders` / `install_orders_slim` view (installations, **no `bm_email`
column** — always resolves by name/phone), `wp_production` (custom wallpaper
runs, has `bm_email`), `profiles`, `app_settings`, `foam_ledger`.

## The BM's order book: three tables, three drawers, one conversion funnel

`SiteAuditBmView` is the BM dashboard; `components/site-audit/views/owned-orders/` holds the Installations
and Custom Wallpaper halves of it, and both are reused by
`SiteAuditBranchManagerView`'s store rollup. Every list opens a drawer; the two
new ones are read-only apart from declaring which site audit an installation
came from, since scheduling stays with the SM and wallpaper production with the
COE.

**Drawer data is fetched per order on open, never added to the list select.**
`log` is jsonb averaging ~7 KB a row and both lists poll every 30s, so the
install/wallpaper drawers read `log`/`service`/`skus`/`notes` for the one row
being looked at (`INSTALL_DRAWER_COLS` / `WP_DRAWER_COLS`). The one thing lifted
into a list select is `auditBy:service->>audit_by` — PostgREST json path with an
alias, so the row can badge audit ownership without carrying the SKU blob.

**Who did the site audit** lives in `install_orders.service.audit_by`
(`material_depot` | `customer` | unset — 192/179/57 of live rows), set by the SM
and auto-detected at creation by `detectAuditBy`. On a Material-Depot-audited
installation, `LinkAuditSection` finds the audit behind it:

1. a declared `jobCardLinks` link wins (either direction — `LinkInstallSection`
   writes the same pair from the audit side);
2. else audits sharing the client's exact phone digits, **pre-bookings
   excluded** — a `slot_reserved`/`slot_converted` row is a held slot, not the
   audit, and its phone is often the store's own;
3. exactly one candidate → shown as "matched by phone" with the visit date on
   it (157 of 182 live rows land here); **two or more → nothing is picked**, the
   BM chooses (16 rows), and that choice becomes the declared link; none → said
   plainly (9 rows), which almost always means the audit was booked against a
   different number.

Matching on `pi` is near-useless here and measuring it is why the fallback is
phone: only 4 of those 182 installations share a `pi` with their audit, because
the audit is raised pre-sale and the installation post-sale against the order's
PI. `LinkAuditSection` takes `attribution` — **omit it and the section goes
read-only**, which is what the branch-manager rollup does: a link nobody can be
named for is not worth writing.

`WpLadder` (`components/site-audit/coe-ops/wallpaper/ladder.tsx`) is the read-only custom-wallpaper stage
ladder, shared by the COE's Wallpaper tab and both BM drawers so the BM can
never be shown a stage list that has drifted from the one the COE is working. A
custom-WP installation resolves its production run by `install_order_id` or
exact `pi` (verified: every run with the id set agrees on `pi`), **never by
phone** — one client's two projects share a number.

## Conversion: did the audit become an order, and where did it stop

`components/site-audit/data/conversion-funnel.ts` answers the question the BM dashboard exists for. Six
steps — audit → cart → quotation → order → installation ordered → installed —
where the middle three come from the **CRM's own Django deal pipeline**
(`/crm/leads/?q=<phone>`), which is where carts, quotations and orders actually
live. This is the swap `coe-ops/shared.ts`'s `orderPlacedFor` comment
anticipated ("when Material Depot's other system exposes carts and product-only
orders, this is the ONLY function that has to change"), reached from inside the
CRM; the two agree, in that an installation order on/after the audit day still
counts as an order placed.

Three rules that must not bend — the second and third were live bugs in the
first draft of this module, caught by exercising `funnelFor` against synthetic
cases before it shipped:

- **Deals are scoped to the audit day**, never to the phone's whole history —
  otherwise a fresh audit is marked converted off an unrelated order from last
  year. Earlier deals are reported as context (`priorDeals`) and never as
  conversion.
- **`unknown` is a distinct state from `pending`.** A failed
  `fetchCRMLeads` means we don't know whether a cart exists. Folding that into
  "no cart yet" would turn one Django outage into a dashboard full of clients
  who look like they walked away, and would send BMs to chase clients who have
  already paid. Hence `Funnel.unknownFrom` alongside `stalledAt`, its own
  "Pipeline unknown" tile, and `?` ticks in the ladder. (`fetchLeadDeals` in
  `mdFetch` (`lib/api/core/client.ts`) swallows its own errors into `[]` — the `Array.isArray`
  landmine above, one level up — so this module calls `fetchCRMLeads` directly.)
- **A lost deal is only the story when nothing else is still moving.** `lost`
  requires no live ranked deal AND no order: a client whose first cart was
  cancelled and whose second is in quote approval has not been lost.
  Symmetrically, `cart_created` is proved by ANY scoped deal including a lost
  one — a cancelled cart was still a cart.

A step with no local evidence *below* one that has some is `implied`, not a gap:
an order raised under a second phone number would otherwise render as "no cart,
no quote, order placed". `DEAL_PIPELINE` mirrors `STATUSES` in `components/crm/constants.ts`
(not exported from that 3.3k-line component); an unlisted status is unranked and
cannot advance the funnel. The B2B side names the same statuses once, in
`components/b2b/models/client/` (`DEAL_ORDER_STATUSES` / `DEAL_LOST_STATUSES`), which
`components/b2b/models/kam/auto-stage.ts` and the Client Database both read — this one stays separate
because it is a RANKED pipeline, not set membership, but a status added to the
CRM has to be added in both. There is deliberately **no "PI shared" step**: the deal
vocabulary has no PI status, and the Footfall/Weekly Funnel dashboards' PI
column is computed server-side from data this endpoint doesn't return.

Cost: one request per client phone, because the batched
`/crm/leads/client-order-history/` endpoint returns a *lifetime* furthest status
with no dates, which cannot be scoped to an audit. Mitigated by a module-level
cache, a concurrency pool of 4, and `FUNNEL_PHONE_CAP` — and the overflow is
**reported in the UI**, not silently dropped. The cache outlives the component,
so the drawer carries a "Re-check the CRM pipeline" button for a BM who has just
raised the cart.

Note this puts a Django call inside the Site Audit tab, so
`/site-audit-view?person=` (which never authenticates) now depends on a real
session for these three steps — it already did via `fetchUsers()`, and a failure
degrades to `unknown` rather than to a wrong answer.

## Analytics: two halves, two sources, one page

Site Audit → Analytics is five tabs over two databases that are never mixed in one number
(ported from `material-depot-site`'s Admin console Analytics V3, 2026-08-26):

| Tab | Source | Where |
|---|---|---|
| **Execution** — bookings, executions, TAT, arrival on time, NPS | ops DB (Site Audit Supabase) | `components/site-audit/views/analytics/index.tsx` |
| **Category · Week on week · Penetration · Targets** — carts, orders, order value, attach rate, audit→order conversion, store penetration, targets | the ORDER BOOK (`materialdepot_azure` via Metabase) | `components/site-audit/ui/cat-analytics-panel.tsx` + `public/md-cat-analytics.js` |

**Three surfaces now report field-service NPS, and they do not all read the same source** — worth
settling before editing any of them, because "add NPS analytics" could plausibly mean any of the
three. Execution (here) joins the **`ratings` projection** to the order; Category Ops →
⭐ Review scores and Category Ops → 📊 NPS analytics both compute from the **call logs**, the
record itself. So the COE tabs are the superset by construction: a score whose projection POST
failed counts there and not here, which is exactly the gap `unprojectedScoredCalls` exists to find
and repair. Verified 2026-09-01 — 41 scored calls in the logs, 41 `ratings` rows dated on or after
2026-08-31, **zero unprojected** — so they agree today; they are not guaranteed to, and a report
that "the two NPS numbers differ by a few scores" is this, in that direction only, and is fixed
from the ⭐ Review scores tab rather than in code.

An order lives in the order book, a site visit lives in Supabase, and **the only bridge between
them is the customer phone number** — which is why the two halves are separate tabs with separate
footnotes, and why no tile adds a booking count to an order count. `components/site-audit/views/analytics/index.tsx`
holds both the Execution view and the shell that renders the tab bar and picks between them.

**`public/md-cat-analytics.js` is a VERBATIM copy of the file with the same name in
`material-depot-site`** — registry, dummy data layer, target model and all four tab renderers, as
a self-contained IIFE that publishes on `window` and touches no DOM, no network and no framework.
That is what makes it shareable byte-for-byte instead of hand-rewritten into JSX. **Fix it in one
repo, copy it to the other; do not fork it** (same rule as the two copies of the job-card category
registry). It is loaded on demand by `components/site-audit/data/cat-analytics.ts` — only when a commercial tab is actually
opened — so its 127 KB never reaches the main bundle. The Execution tab loads it too, in the
background, purely for `mdAnGrouped`/`mdAnTatHtml` so the bookings and TAT charts match the
commercial ones; a failed load costs those two blocks, never the ops numbers.

Because the renderers return **HTML strings**, three things follow:

- They need the Admin console's CSS, which lives at the bottom of `app/globals.css` **scoped under
  `.md-an`**, with the palette variables on `.md-an` rather than `:root` so none of it reaches the
  Tailwind side of the CRM. Any wrapper that injects this HTML must carry that class.
  One deliberate un-reset: Tailwind preflight's `svg { max-width: 100% }` is switched off inside
  the scope, because the charts already decide their own scaling.
- The tab bodies carry the module's own inline `onclick`/`onchange` handlers (`anDrill`, `anCsv`,
  `anTargetInput`, `anSaveTargets`, …), so `CatAnalyticsPanel` publishes exactly those names on
  `window` while mounted and **restores the previous values on unmount** — two mounts (rail plus a
  Role Viewer preview) must never leave a handler pointing at an unmounted panel. Anything those
  handlers read comes from a ref, or a CSV export would keep exporting the range the tab opened on.
- Targets are edited in a **mutable ref** with a `nonce` bump to redraw, not in state. That is
  deliberate: an edit touches one cell of a 7-month × 13-store × 6-category object, nothing is
  written until Save, and abandoning the tab abandons the edits. Save writes the whole object to
  `app_settings.cat_analytics_targets`, shared with the Admin console.

**Every tile on the Execution tab is clickable and opens the rows behind it** (added 2026-08-26):
which orders met the criterion, which did not, who they were assigned to, the booked slot vs the
actual arrival time, and a CSV. `M.drills` in `components/site-audit/views/analytics/index.tsx` is the registry; `DrillRow.hit`
is `'yes'` (numerator) / `'no'` (rest of the denominator) / `'na'` (genuinely neither — a Neutral
rating, or a signature that could not be read, which must never be folded into "no").

**The invariant: a drill's row set IS its tile's denominator, built off the same variable the tile
renders.** So the status and delivery drills iterate `iAttempts`, Job Card iterates only the
completed/partial attempts, MD Audit iterates distinct PIs, the ratings drills iterate the rating
map, and the arrival drills iterate the rows `_anArrivalStats` tags in the same loop that does the
counting. A drill that disagrees with the tile it opened from is worse than no drill — so when you
add a tile, derive its drill from the same variable, never from a fresh filter that looks right.
(`iNoDelayLog` is literally `iDelayLog` with the verdict inverted, for that reason.) The ratings
drills pass an explicit `summary`, because yes/(yes+no) there would be promoters over
promoters-plus-detractors — not NPS, not anything.

**Arrival counts one visit once, and did not used to.** `_anArrivalStats` now dedupes on
order + person + day. The field apps write the "arrived at site" log line more than once for a
single visit — 17 install and 30 audit person-day pairs on live data as of 2026-08-26, one audit
logged **20 times** — which was inflating the install arrival metric by 13% and the audit one by
23% (install went 53% → 56%, audit 60% → 63% when fixed). The PWA's Admin console has always
deduped this way; this port never did, and nobody could see it until the tiles started listing
their own rows. Any new metric read off `log` entries needs the same guard.

The install select carries `customer_name`, `bm` and `phone` **for the drills** — a list of enquiry
IDs does not answer "which orders". They are columns on `install_orders_slim`, so this costs no
extra query. Note the log enrichment uses `?? o.phone` rather than `|| null`: it only covers orders
created from 1 Jul 2026, and blanking the phone on older ones made them unmatchable against site
audits, i.e. a false "no audit".

**The commercial numbers are DUMMY right now, and the UI says so** — an amber "◆ Dummy data" badge
in the filter row plus a footer explaining every definition and limit. The generator is seeded from
the Jun–Aug 2026 category workbook and reconciles back to it exactly, so the figures are arithmetic,
not noise. It covers **1 Jun – 17 Aug 2026 only**, which is why the date pickers clamp to that
window (`clampToData`): today is past the cut, so an unclamped "this month" would render an empty
dashboard that reads as broken. **To go live: implement `MD_AN_SOURCE.metabase()` in
`public/md-cat-analytics.js` to return the shape `MD_AN_SOURCE.dummy()` returns (documented at
`MD_AN_ROW_CONTRACT` in that file) and flip `mode`.** Nothing in `components/site-audit/ui/cat-analytics-panel.tsx` or
`components/site-audit/data/cat-analytics.ts` changes — the badge, the footer and the clamp all read that flag themselves.

Two intentional differences from the Admin console version: city comes from the CRM's own header
selector (the `city` prop) instead of the filter row's own buttons, so there is one city control per
page; and the filter row is real React rather than an HTML string, because it is this app's chrome
rather than part of the shared dashboard. See also the `service_mgr` gate under Known landmines.

## Review scores → NPS: one pipeline, and where it leaks

Q1/Q2/Q3 (overall experience / staff / site cleanliness, 1–10) used to be
collected on-site, on the job card, handed to the client by the field worker
being rated — which biased every score upward. Collection moved to a Category
Ops phone call the day after the job: `components/site-audit/coe-ops/views/followups.tsx` for the audit's
D+1 checkpoint, `components/site-audit/coe-ops/views/install-reviews.tsx` for one checkpoint per completed
install sub-job. **This repo's own field apps kept writing on-site scores until
`c4f1296` (2026-08-24)**, four days after `material-depot-site` stopped, so the
live `ratings` table holds two populations with opposite bias — worth saying out
loud before anyone reads a trend across that date.

The chain, and what owns each link:

| Link | Where | Note |
|---|---|---|
| Source of truth | `coe_track.calls[].ratings` (audit) · `subjobs[].coe_review.calls[].ratings` (install) | append-only, inside jsonb this app already writes |
| Projection | `ratings` table (`postJobRating`) | a second copy, written for Analytics only |
| Bands | `npsFrom`/`npsBand` in `shared/format.ts` | ONE definition; see below |
| Read | `SiteAuditAnalyticsView` · `components/site-audit/coe-ops/views/review-scores.tsx` · `components/site-audit/coe-ops/views/nps-analytics.tsx` | all three read the same helpers |

**The `ratings` table is a projection, not the record.** The PATCH that saves
the call and the POST that projects it are two writes; the second can fail
alone. `components/site-audit/coe-ops/views/review-scores.tsx` is what closes that loop —
`unprojectedScoredCalls` diffs the call logs against the table and offers to
push what never landed. Two match rules, both needed: same order within 30
minutes of the call (the normal case, and tight enough that a pre-2026-08-24
on-site rating on the same order can't be mistaken for it), or same order plus
identical Q1/Q2/Q3 at any time (so an already-pushed score isn't offered
forever). Rows are consumed as they match, so two scored calls on one order
need two rows.

**Analytics joins ratings to the ORDER, never by `ratings.created_at`.**
`_anAttachAuditRatings` / `_anAttachInstallRatings`, ported from Admin.html.
While the field app wrote the score at signing time the two were the same set;
once collection moved to a D+1 call they came apart, and a created_at filter
lends a job's score to the period *after* the one it describes. The join also
de-duplicates — 13 audit orders in live data carry more than one rating, which a
date filter counts twice. Install is the awkward half: a rating's `order_id` is
the *parent* order, shared by every sub-job, so it's disambiguated by rated
installer email, then nearest completion date (only 3 rated orders live have 2+
completed sub-jobs, so this rarely bites). Consequence to expect, not fix: the
last few days of any range show fewer scores than jobs, because those D+1 calls
haven't happened yet.

**Two different NPS numbers live in this portal, and both are correct.** Site
Audit → Analytics, Category Ops → Review scores and Category Ops → NPS analytics
report *field-service* NPS on Material Depot's stricter house bands (promoter
9–10, neutral 8, **detractor ≤7**), matching Admin.html. The `crm.nps` tab
(`components/nps`) reports *store-visit* NPS from the Django footfall tracker on
textbook bands (detractor ≤6) — a different question of a different population.
Never average them, and never "fix" one to match the other; each names itself and
prints its bands on screen so a reader can't mistake which is on the page.

The trap here is now specifically **layout**, not arithmetic: `components/site-audit/coe-ops/views/nps-analytics.tsx`
deliberately borrows `components/nps`'s tile-and-chart layout because that is the
shape the business already reads — so the two pages LOOK alike while measuring
different populations on different bands. That is exactly why the house-bands
note sits in its filter row and the band names ride on the promoter/neutral/
detractor tiles themselves. Don't tidy those labels away, and don't copy
`components/nps`'s `bucketOf`/`catOf` (textbook) into the Site Audit side while
borrowing its components.

**Job Card & Signature % is measured from the signature**, not from "a rating
exists". That proxy was only ever true while the field app wrote the rating at
signing time. Audit reads `audit_ticked->sign->>name`, install reads
`subjobs[].jobcard.sign`.

## The COE dashboard's six tabs, and the three things they share

`SiteAuditCoeView` does ONE data load (`audit_orders` completed + `install_orders_slim`
+ `wp_production` + `ratings`) and hands the same in-memory rows to every tab, so a
number on one tab can never disagree with another. Six tabs as of 2026-09-01:
Audit Follow-ups · Install Reviews · ⭐ Review scores · 📊 NPS analytics ·
Custom wallpaper · Where it stalls.

Three things are shared deliberately, and each of them is shared because the
alternative was two copies that drifted:

**One category vocabulary** (`coe-ops/shared.ts`). `CAT_FLOORING` / `CAT_WALLPAPER` /
`CAT_CUSTOM_WP` / `CAT_WALLPANEL` / `CAT_CNC`, plus `CAT_UNSET` which is a FILTER
bucket, not a category. Audits resolve through `auditCategories`, install sub-jobs
through `subjobCategory`. Both tables' category column and both category filters read
these, so "Flooring" on one tab and "Wooden Flooring" on the other can't split one
material into two filter entries. Two traps live in here:

- **A completed audit's categories are only in `audit_ticked`, and that column is the
  whole job card.** `service.flooring`/`service.wallpaper` — what `categoriesFor` used
  to read alone — is empty on 318 of 330 live completed audits, and 317 of them carry
  no non-audit SKU either, so the old fallbacks answered 12 rows out of 330 and the
  column was `—` for everyone else. `audit_ticked` answers 303. So there is a second,
  separate query (`AUDIT_TICKED_QUERY`, ~1.2 MB / ~1.4s) which is **not in the 30s
  poll**: a completed audit's job card is terminal, so `SiteAuditCoeView` asks once and
  then only again when an order appears that it has no answer for. Last good answer in
  a ref, fire-and-forget, fails quietly — same shape as `SiteAuditOpsView`'s own
  `AUDIT_CATEGORY_QUERY`, and for the same detoast reason. **Do not "simplify" this by
  adding `audit_ticked` to `AUDIT_COLS`.**
- **A room with neither `category` nor `type` is skipped, not defaulted.**
  `categoryFor`/`typeLabel` both fall back to flooring; 45 live rooms have neither, and
  defaulting them invents a material the auditor never ticked. They land in
  `CAT_UNSET` (27 audits), which is filterable and honest. Likewise `custom_wp` is a
  flag on the install ORDER while its sub-job still reads `wallpaper` — miss that and
  this filter disagrees with the Custom wallpaper tab about which installs are custom.

**One date-range vocabulary** (`DATE_PRESETS`/`presetRange`/`inDateRange`/
`previousRange`). Ranges are inclusive both ends, compared as `YYYY-MM-DD` strings,
and `{from:'',to:''}` IS "all time" so there is no separate no-filter flag. A row with
no date is in the unbounded range and out of every bounded one — it can't be claimed
for a window nobody can place it in. `previousRange` abuts the range without
overlapping it, which is what the NPS deltas rest on.

**Filter order, which is not cosmetic: date + category → buckets → search.** The
bucket tiles are the denominator the COE works the queue by, so they count what the
date and category filters leave; "3 Overdue" above a table of 40 rows is worse than no
tile at all. Search is the one filter the tiles deliberately ignore — typing a name
should narrow the list, not renumber the queue. Both queues also keep the invariant the
buckets always had: they partition the filtered set and sum to its total.

**The frozen bar** (`coe-ops/filters.tsx`) pins the filters and bucket tiles while rows
scroll under them. Its `top` is **measured, never hard-coded**: each host that mounts
this dashboard has its own sticky header at a height this component can't know —
the CRM shell's is a fixed 48px, `/site-audit-view`'s wraps and changes with the window
— so `useFrozenBar` walks up the ancestors summing the heights of preceding siblings
that are pinned to the top. **The table's `<thead>` is deliberately NOT sticky, and
can't be:** the wrapper around it is `overflow-x-auto`, which makes that wrapper the
sticky scrollport rather than the document, so `sticky top-N` on a header cell doesn't
pin to the viewport — it shifts the header row N pixels DOWN over the first rows (this
was live for one iteration and looks exactly like a rendering bug). CSS won't let the
wrapper scroll on one axis only, either: `overflow-y: visible` next to
`overflow-x: auto` computes back to `auto`. The frozen bar works because it sits
outside that wrapper.

### Every cart on the client's number (`components/site-audit/coe-ops/views/client-carts.tsx`)

Both call queues' drawers show all of a client's CRM deals for their phone —
`/crm/leads/?q=<phone>`, the same rows the Leads tab renders. It exists because
`orderPlacedFor` can only see an INSTALLATION order, so a client who took a site audit
and then bought tiles, wallpaper and laminates as separate product carts read as "Not
yet", and the COE had to leave the dashboard and search the number by hand.

It inherits both of `components/site-audit/data/conversion-funnel.ts`'s rules verbatim. `q` is a free-text search
that also matches names and cart ids, so results are **re-filtered on `phoneKey`** — a
client whose name contains the digits must not inherit somebody else's deals. And a
failed request is reported as **unreadable, never as "no carts"**: telling a COE a
client walked away when they have already paid is the most expensive wrong answer this
panel could give. Deals are SPLIT by the anchor day rather than filtered to it (all of
them is the ask), with the earlier ones labelled history and never counted as this
job's conversion — the same scoping rule `funnelFor` enforces.

Note this panel puts a Django call behind a drawer open, so on `/site-audit-view`
(which never authenticates) a 401 from it will `forceReLogin()` and drop the preview
session. Stub the Django host to exercise it — see *Auth, and why a fake session won't
work*.

### 📊 NPS analytics (`components/site-audit/coe-ops/views/nps-analytics.tsx`)

Field-service NPS over a picked date range, laid out like `components/nps`'s
store-visit dashboard because that is the shape the business already reads. Three
things it does NOT do, each for a reason recorded elsewhere in this file: it uses the
house bands via `npsFrom`/`npsBand` (never textbook — and prints them on screen); it
computes from `scoredCalls` over the CALL LOGS, never from the `ratings` projection, so
it and ⭐ Review scores cannot disagree; and it therefore dates a score by the day the
COE MADE the call, not by `ratings.created_at`.

Coverage on that tab is deliberately **all-time, not range-scoped** — it is "every
review currently owed", the same denominator the Overdue buckets show — and it says so
on screen.

Two rendering rules worth keeping: a day with no calls is a BREAK in the trend line
(`connectNulls={false}`), not a zero, because interpolating it invents scores; and
"NPS by rated staff" is a div-based diverging bar list rather than a Recharts
`BarChart` because **a bar chart draws nothing at all for a value of exactly 0** — no
bar, and it skips the label too — and worst-first sorting puts precisely that row at
the top, so the one person a reader most needs to see was the one row with nothing on
it.

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
`dropSupersededPreBookings` (`components/site-audit/views/bm/index.tsx`) uses. Name and phone are free
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
main list with a dedicated pre-booking filter (`components/site-audit/audit-ops/views/`) — that is
deliberate, not an inconsistency. Don't unify them.

## `Array.isArray(rows) ? rows : []` turns a server error into empty data

`sbGet` (`shared/sb-client.ts`) returns `r.json()` **without checking `r.ok`**, so
any 4xx/5xx resolves a PostgREST *error object*, not a throw. Callers that write
`Array.isArray(rows) ? rows : []` therefore render a server error as legitimately
empty — indistinguishable from "nothing matched".

The same shape bites one level up, and that case is easier to miss: a wrapper
that catches into `[]` makes its CALLER's error branch dead code.
`fetchLeadDeals` catches, so `lookupEnqId`'s `unavailable` state — written
specifically so a Django outage could not be reported as an invalid Enquiry ID —
could never fire (fixed 2026-09-08). **When you write a distinct failure state,
check that the thing you call can actually fail into it.** `fetchClientTickets`
and `fetchClientOrderRows` call `fetchCRMLeads` directly for this reason.

Harmless for a count or a badge. **Dangerous for anything a workflow is gated
on.** It hard-blocked assignment in both ops views (fixed 2026-08-19, commit
`c589ec8`): the auditor/installer rosters load once when the view mounts but the
assignment picker reads them on every drawer open, so one failed fetch emptied
the picker for as long as the view stayed mounted, and the empty state blamed the
city filter for what was a connection problem.

The shape to copy when a load feeds a picker or a gate — see `loadAuditors` in
`components/site-audit/views/ops/index.tsx`:

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

## Two render-loop guards

- **`use-owned-extras`' `deps` is a stable key for `people`.** The array's
  identity changes on every render of the parent, so depending on the array
  itself re-fetches in a loop.
- **`cat-analytics-panel`'s `nonce` is the redraw trigger** for in-place target
  edits, working alongside `targetsRef`. Editing a target mutates the ref and
  bumps the nonce rather than replacing state.
