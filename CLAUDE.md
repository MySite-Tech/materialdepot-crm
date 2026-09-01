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

## The BM's order book: three tables, three drawers, one conversion funnel

`SiteAuditBmView` is the BM dashboard; `ownedOrders.tsx` holds the Installations
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

`WpLadder` (`coe-ops/WpLadder.tsx`) is the read-only custom-wallpaper stage
ladder, shared by the COE's Wallpaper tab and both BM drawers so the BM can
never be shown a stage list that has drifted from the one the COE is working. A
custom-WP installation resolves its production run by `install_order_id` or
exact `pi` (verified: every run with the id set agrees on `pi`), **never by
phone** — one client's two projects share a number.

## Conversion: did the audit become an order, and where did it stop

`conversionFunnel.ts` answers the question the BM dashboard exists for. Six
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
  `lib/mockApi` swallows its own errors into `[]` — the `Array.isArray`
  landmine above, one level up — so this module calls `fetchCRMLeads` directly.)
- **A lost deal is only the story when nothing else is still moving.** `lost`
  requires no live ranked deal AND no order: a client whose first cart was
  cancelled and whose second is in quote approval has not been lost.
  Symmetrically, `cart_created` is proved by ANY scoped deal including a lost
  one — a cancelled cart was still a cart.

A step with no local evidence *below* one that has some is `implied`, not a gap:
an order raised under a second phone number would otherwise render as "no cart,
no quote, order placed". `DEAL_PIPELINE` mirrors `STATUSES` in `app/App.tsx`
(not exported from that 3.3k-line component — `b2b/kamAutoStage.ts` re-declares
it locally for the same reason); an unlisted status is unranked and cannot
advance the funnel. There is deliberately **no "PI shared" step**: the deal
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
| **Execution** — bookings, executions, TAT, arrival on time, NPS | ops DB (Site Audit Supabase) | `SiteAuditAnalyticsView.tsx` |
| **Category · Week on week · Penetration · Targets** — carts, orders, order value, attach rate, audit→order conversion, store penetration, targets | the ORDER BOOK (`materialdepot_azure` via Metabase) | `CatAnalyticsPanel.tsx` + `public/md-cat-analytics.js` |

An order lives in the order book, a site visit lives in Supabase, and **the only bridge between
them is the customer phone number** — which is why the two halves are separate tabs with separate
footnotes, and why no tile adds a booking count to an order count. `SiteAuditAnalyticsView.tsx`
holds both the Execution view and the shell that renders the tab bar and picks between them.

**`public/md-cat-analytics.js` is a VERBATIM copy of the file with the same name in
`material-depot-site`** — registry, dummy data layer, target model and all four tab renderers, as
a self-contained IIFE that publishes on `window` and touches no DOM, no network and no framework.
That is what makes it shareable byte-for-byte instead of hand-rewritten into JSX. **Fix it in one
repo, copy it to the other; do not fork it** (same rule as the two copies of the job-card category
registry). It is loaded on demand by `catAnalytics.ts` — only when a commercial tab is actually
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
actual arrival time, and a CSV. `M.drills` in `SiteAuditAnalyticsView.tsx` is the registry; `DrillRow.hit`
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
`MD_AN_ROW_CONTRACT` in that file) and flip `mode`.** Nothing in `CatAnalyticsPanel.tsx` or
`catAnalytics.ts` changes — the badge, the footer and the clamp all read that flag themselves.

Two intentional differences from the Admin console version: city comes from the CRM's own header
selector (the `city` prop) instead of the filter row's own buttons, so there is one city control per
page; and the filter row is real React rather than an HTML string, because it is this app's chrome
rather than part of the shared dashboard. See also the `service_mgr` gate under Known landmines.

## Review scores → NPS: one pipeline, and where it leaks

Q1/Q2/Q3 (overall experience / staff / site cleanliness, 1–10) used to be
collected on-site, on the job card, handed to the client by the field worker
being rated — which biased every score upward. Collection moved to a Category
Ops phone call the day after the job: `coe-ops/Followups.tsx` for the audit's
D+1 checkpoint, `coe-ops/InstallReviews.tsx` for one checkpoint per completed
install sub-job. **This repo's own field apps kept writing on-site scores until
`c4f1296` (2026-08-24)**, four days after `material-depot-site` stopped, so the
live `ratings` table holds two populations with opposite bias — worth saying out
loud before anyone reads a trend across that date.

The chain, and what owns each link:

| Link | Where | Note |
|---|---|---|
| Source of truth | `coe_track.calls[].ratings` (audit) · `subjobs[].coe_review.calls[].ratings` (install) | append-only, inside jsonb this app already writes |
| Projection | `ratings` table (`postJobRating`) | a second copy, written for Analytics only |
| Bands | `npsFrom`/`npsBand` in `siteAuditShared.ts` | ONE definition; see below |
| Read | `SiteAuditAnalyticsView` · `coe-ops/ReviewScores.tsx` | both read the same helpers |

**The `ratings` table is a projection, not the record.** The PATCH that saves
the call and the POST that projects it are two writes; the second can fail
alone. `coe-ops/ReviewScores.tsx` is what closes that loop —
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
Audit → Analytics and Category Ops → Review scores report *field-service* NPS on
Material Depot's stricter house bands (promoter 9–10, neutral 8, **detractor
≤7**), matching Admin.html. The `crm.nps` tab (`components/nps`) reports
*store-visit* NPS from the Django footfall tracker on textbook bands (detractor
≤6) — a different question of a different population. Never average them, and
never "fix" one to match the other; each names itself and prints its bands on
screen so a reader can't mistake which is on the page.

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
`app/App.tsx`'s is a fixed 48px, `/site-audit-view`'s wraps and changes with the window
— so `useFrozenBar` walks up the ancestors summing the heights of preceding siblings
that are pinned to the top. **The table's `<thead>` is deliberately NOT sticky, and
can't be:** the wrapper around it is `overflow-x-auto`, which makes that wrapper the
sticky scrollport rather than the document, so `sticky top-N` on a header cell doesn't
pin to the viewport — it shifts the header row N pixels DOWN over the first rows (this
was live for one iteration and looks exactly like a rendering bug). CSS won't let the
wrapper scroll on one axis only, either: `overflow-y: visible` next to
`overflow-x: auto` computes back to `auto`. The frozen bar works because it sits
outside that wrapper.

### Every cart on the client's number (`coe-ops/ClientCarts.tsx`)

Both call queues' drawers show all of a client's CRM deals for their phone —
`/crm/leads/?q=<phone>`, the same rows the Leads tab renders. It exists because
`orderPlacedFor` can only see an INSTALLATION order, so a client who took a site audit
and then bought tiles, wallpaper and laminates as separate product carts read as "Not
yet", and the COE had to leave the dashboard and search the number by hand.

It inherits both of `conversionFunnel.ts`'s rules verbatim. `q` is a free-text search
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

### 📊 NPS analytics (`coe-ops/NpsAnalytics.tsx`)

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

- **The field apps write a log line more than once for one event, so any metric
  counted off `log` entries must dedupe before it counts.** Arrival on time was
  counting the same visit repeatedly — 17 install and 30 audit person-day pairs
  in live data on 2026-08-26, one audit visit logged **20 times**, inflating the
  install metric by 13% and the audit metric by 23%. `_anArrivalStats` now keys
  on order + person + day (the PWA's Admin console always did; this port did
  not). Nothing surfaced it for weeks because a percentage cannot show you its
  own duplicate rows — it only became visible once the tiles started listing
  them. Two rules follow: a new log-derived metric needs the same guard, and
  mark a row "seen" only once it actually *counts*, or an entry skipped for a
  missing slot suppresses a later write for the same visit that would have
  resolved. See the Analytics section above.
- **A second write that only `console.error`s on failure is silent data
  loss.** Both COE rating forms saved the call, then projected the score into
  `ratings` inside `try { … } catch { console.error }`. The COE saw "Call
  logged", the score sat in the call log, and Analytics' NPS never counted it —
  with no error anywhere a human would look. Fixed 2026-08-25: the failure is
  surfaced in the form, `run()` now returns whether the call itself saved (so a
  score is never projected for a call that didn't), and Category Ops →
  ⭐ Review scores finds and pushes anything that slipped through. The same
  shape still exists elsewhere in this repo — `upsertSiteAuditProfile()` in
  `app/App.tsx` is fire-and-forget with `.catch(console.error)`. Treat
  `.catch(console.error)` on a write as a bug report waiting to happen.
- **`audit_ticked->sign->>name` is cheap to transfer and expensive to READ.**
  The json path keeps the job-card room photos off the wire, but Postgres still
  detoasts the whole `audit_ticked` blob per row, so that select over all ~1.1k
  audit rows dies with `57014 canceling statement due to statement timeout`
  (500, not an empty result). `SiteAuditAnalyticsView` fetches it as its own
  query scoped to `status=eq.completed` — the 306 rows the metric's denominator
  actually needs — which returns in ~3s. If you add another jsonb-path column
  to a full-table select here, time it first.
- **As of 2026-08-25 not one COE call has ever been logged in production.**
  `coe_track` is non-null on 527 `audit_orders` rows and `{}` on every one of
  them; zero rows carry `calls`, zero `order_placed` marks, and zero install
  sub-jobs carry a `coe_review`. So all 444 rows in `ratings` are on-site
  scores, the newest dated 2026-08-24 — the day this repo removed on-site
  collection. **Field-service NPS therefore has no live source right now**: the
  old one is gone and the new one is unused. Any report of "NPS is empty /
  stale" is this, not a code fault — check `coe_track` for calls before
  debugging the pipeline.

- **A floor has no height — per-category wording belongs in `auditRegistry.ts`,
  not in the capture form.** `SegmentAdjustments` hardcoded the rectangle
  dimension pair as Height x Width, which is right for a wall and wrong for
  `flooring`, whose own fields are Room length / Room width. It is not a rare
  path: in a 60-order live sample, flooring carried **17 of the 28** area
  adjustments (more than wallpaper), every one of them a Rectangle, and the
  reasons are furniture footprints — "Bed", "Cupboard" — which have a length,
  never a height. Now `cat.adjDim1` (absent => 'Height'). The Triangle branch
  deliberately keeps Base x Height: there `h` is the perpendicular altitude in
  the ½·base·height formula, and zero triangle adjustments exist in live data.
  The stored keys stay `h`/`w` — only the label is per-category, so no migration
  and no change to `adjRows`, whose `size` string ("6.5 x 6 ft") is
  orientation-neutral and is what every read-only view and the PDF render.
  `md-audit-registry.js` + `Site_Auditor_App.html` in `material-depot-site`
  carry the identical fix; keep the two registries in step.
- **The read side aliases `customer_name` to `name`, and both order drawers
  wrote the alias back.** `audit_orders` and `install_orders` have a
  `customer_name` column and no `name` column at all (`profiles` does, which is
  what makes the mistake easy). `install-ops/shared.ts` and `audit-ops/shared.ts`
  both map `name: r.customer_name` on load, and both drawers' "Fix details" form
  PATCHed `{ name, phone, addr }` — PostgREST rejects the *whole* body with
  `PGRST204 Could not find the 'name' column`, so the phone and address were
  lost along with the name. Fixed 2026-08-26. When you add a write, check it
  against the column list, not against the UI type: the two disagree by design
  for `customer_name`, `matched_audit`/`matchedAudit`, `delivery_date`/
  `deliveryDate` and `original_delivery_date`.
- **`install-ops/OrderDrawer`'s `persist()` had no error handling, so every
  write in that drawer failed silently.** `sbPatch` *does* throw on a non-2xx
  (unlike `sbGet` — see the `Array.isArray` section), but `persist` was a bare
  `await sbPatch(...)` and none of its callers caught, so the rejection escaped
  into the click handler as an unhandled promise: no toast, no console entry a
  user would see, a Save button indistinguishable from a dead one. That is the
  only reason the `name` bug above survived — the SM had no way to learn the
  write was being refused. `persist` now catches, toasts, and returns whether
  the write landed (callers gate their form-close on it, and the three that had
  hand-rolled try/catch now pass a `failMsg` instead).
  `audit-ops/AuditOrderDrawer`'s `patch()` already had this shape — copy it, and
  treat a write wrapper with no catch the same way as `.catch(console.error)`.
- **A field app's stale-write guard has to compare like with like — the guard
  itself was the outage.** `advanceStatus` (`SiteInstallerApp.tsx`) and `adv`
  (`SiteAuditorApp.tsx`) re-read the row before writing so an SM's concurrent
  change can't be clobbered (added 2026-08-21, `41a60d1`). Both compared a RAW
  DB status against the flattened on-screen one — different vocabularies — so
  the guard fired on jobs nobody had touched, and its own toast ("refresh to see
  the latest") could never clear it because nothing was stale. Three distinct
  mismatches, all live on 2026-08-26: `assigned` (DB) vs `scheduled` (UI,
  mapped in `loadJobs`); the display-only autoFlip to `callpending` 3h before
  the slot, which is never persisted; and the installer's own
  `assignments[].status` vs `sj.status`, which **only the PRIMARY writes** —
  `markAdditionalComplete` writes the assignment and nothing else, so an
  additional installer's "Your part marked complete" never moved their screen.
  19 of 43 live installer×sub-job pairs (44%) could not be advanced at all, and
  every freshly assigned audit was unstartable. Fixed with one derivation each:
  `statusForInstaller(sj, email)` and `normalizeAuditStatus(s)` — `loadJobs`
  **and** the guard must both call it, and the installer guard compares
  `job.storedStatus` (un-flipped) rather than `job.status`. Add a status or a
  display flip *there*, never at a call site. Note the PWA's
  `Site_Installer_App.html` has no such guard at all, so this class of drift is
  invisible in that app — don't take "it works in the field app" as evidence.
- **An SM re-assignment resets `sj.status` to `assigned` but used to leave the
  per-assignee statuses alone.** `AssignSection.saveAssign` seeds its editor by
  spreading the existing `assignments` rows, so re-assigning after a reschedule
  left `status:'reschedule'` on the assignment under a sub-job that said
  `assigned` — and since the field app reads the installer's *own* status, that
  showed them "To Reschedule — nothing to do" on a job just booked for them. It
  now resets each saved assignment to `assigned`, treating `completed` as
  terminal exactly as `OrderDrawer`'s `setStatus` does. Live proof this mattered:
  `ENQ2026071279303`'s wallpaper sub-job was re-assigned to Nadeem Khan on
  2026-08-12 *after* he had signed its job card, so `sj.status` read `assigned`
  over an assignment that (correctly) read `completed`. `SM_Install_Dashboard.html`
  in `material-depot-site` still has the un-fixed shape — keep them in step if
  you touch either.
- **These two apps are PORTS of PWA apps that are still being changed, so a
  status this repo has never heard of can appear in shared data at any time.**
  `partial` is a first-class SUB-JOB status written by
  `material-depot-site`'s `Site_Installer_App.html` partial-completion flow;
  `SiteInstallerApp.tsx` knew nothing about it, so those sub-jobs rendered a raw
  `partial` pill above a detail panel with **no stage card and no buttons** —
  the same dead end as a hard block, just quieter. Both field apps now carry a
  stage registry (`INSTALL_STAGES` / `AUDITOR_STAGES`) and fall through to a
  self-describing "nothing for you to do right now — the office moves it on"
  block, so the next unknown status degrades instead of rendering blank. Keep
  the registry and the rendered branches in step.
- **`slot_reserved`/`slot_converted` pre-bookings were reaching auditors' own
  job lists.** 18 live reservation rows carry an `auditor_email`, so six real
  auditors saw held store slots as jobs — un-actionable by definition, since the
  real audit is a separate row (the reservation's `po` is that row's `pi`; 13 of
  the 18 were already `completed` there). `SiteAuditorApp`'s `loadJobs` now
  filters both statuses out, matching what `audit-ops/Views.tsx` already does
  for the ops list.
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
  filtered out of the tab bar, and re-checked in `anSetTab`). **Those four commercial tabs now
  exist here too** (ported 2026-08-26 — see the *Analytics: two halves* section below), so the
  gate is live rather than hypothetical: `SiteAuditAnalyticsView` takes `execOnly`, and every
  service-manager host passes it — the SM's own dashboard, the SM view inside the Role Viewer,
  and `/site-audit-view`'s SM body. Gated twice, like the original: the tab bar renders only
  Execution AND `pick()` refuses anything else, so a stale `md_an_tab` in localStorage can't get
  past it. **Add a fifth mount of this view and you must decide `execOnly` for it** — the default
  is all five tabs, i.e. the order book. Related: this repo's Role Viewer renders each role's components inline rather
  than copying the original's iframe + localStorage impersonation, which is also why the
  2026-08-18 preview-leak bug in that app (its note 112) has no counterpart here.
- Site Audit `profiles` rows double as login identities on the still-live public
  `material-depot-site.vercel.app/Login.html` (email + 4-digit passcode, no OTP).
  Never create a profile with `passcode: null`; use `randomPasscode()`.
- **A reference list loaded once on mount, but read on every drawer open, breaks
  permanently on one failed fetch.** That is what killed auditor assignment;
  `loadOrders`-style retry + a self-describing empty state is the fix, not a
  louder `console.error`. See the `Array.isArray` section above.
- **`AUDIT_COLS` (`SiteAuditBmView.tsx`) now also carries `bm_journey` and
  `coe_track`**, so the conversion funnel can honour a manual "order placed"
  tick from either the BM or the COE for the whole list in one pass. They add
  ~16 KB to a ~2 MB payload (`log` + `skus` are almost all of it) — but do NOT
  copy them into `ROLLUP_AUDIT_COLS`, whose whole point is being narrow.
- **`SiteAuditBranchManagerView`'s `ROLLUP_AUDIT_COLS` is deliberately narrower
  than `AUDIT_COLS`** (dropping `log`/`skus` cut this list from 1.9 MB per poll to
  107 KB) — but it must keep `po`, which is never rendered and exists only so
  `dropSupersededPreBookings` can tell a held slot from the audit it became.
- **Never gate a mandatory action note on `window.prompt()`/`window.confirm()`/
  `window.alert()`.** They silently no-op in the contexts this app actually runs
  in — installed PWAs and mobile webviews commonly return `null`/`false`
  immediately with no dialog shown at all — and desktop Chrome permanently
  disables them per-origin once a user ticks "prevent this page from creating
  additional dialogs". The old `requireNote()` (site-audit install-ops'
  mandatory notes for status changes, follow-up date set/clear, installer
  assignment, added 2026-08-24) hit exactly this: a click did nothing, no
  error, indistinguishable from a broken button (fixed 2026-08-25). Use
  `useNoteModal()` (`components/site-audit/NoteModal.tsx`) instead — a
  controlled in-page modal with the same "returns the trimmed note, or `null`
  if cancelled/left blank; caller MUST abort on `null`" contract, just as real
  DOM instead of a native dialog. `OrderDrawer.tsx`, `AssignSection.tsx`,
  `AuditOrderDrawer.tsx` and — since 2026-09-01 — `coe-ops/Followups.tsx`
  ("Mark lost") and `coe-ops/Wallpaper.tsx` ("Put on hold", "Cancel PO") use it.
  Reuse it rather than reaching for `window.prompt` again anywhere in Site
  Audit/Install. Those three survived four weeks past the first sweep because
  nothing about a silently no-opping button looks broken in code review, so
  **grep for `window.prompt` rather than assuming the sweep was complete** — one
  is still live at `install-ops/OrderDrawer.tsx:179` (the required reason for
  force-completing an order with no signed job card). That one at least aborts
  with a toast rather than doing nothing, but an SM in a webview cannot force a
  completion at all; it is the next one to convert.
- **`branch_mgr` was added to the app on 2026-08-14 but the Site Audit
  Supabase's `profiles_role_check` CHECK constraint (plain `role in (...)`,
  not a Postgres enum type) was never widened to allow it — so every write
  that sets `role='branch_mgr'` fails at the DB layer, silently in some
  paths.** Found 2026-08-25 when 6 real branch managers (CRM `manager`/
  `store_manager` permission) had been stuck at "0 members" for 11 days.
  Three separate call sites hit this: `SiteAuditUsersView.tsx`'s "Add New
  User" (`sbPost`, surfaces the raw Postgres error to the admin — this is how
  it was found); `applyRoleSync`'s bulk "Sync roles from CRM permissions"
  (`sbPatch`, same failure); and `upsertSiteAuditProfile()` fired from the
  CRM's own Admin > Users when `site_audit.branch_mgr` is ticked
  (`app/App.tsx`, fire-and-forget with `.catch(console.error)` — fails on
  *every* save of that permission with no admin-visible error at all).
  Migration: `site-audit-migration-002-branch-mgr-role.sql` (run against the
  Site Audit Supabase, same as migration 001).
  **Also worth knowing while chasing this**: a Branch Manager doesn't
  actually need a `profiles` row to see their dashboard at all —
  `SiteAuditOwnDashboard.tsx`'s `sessionOnlyRole` branch renders
  `SiteAuditBranchManagerView` straight off the CRM session once
  `permissionRole==='branch_mgr'`, which comes purely from the
  `site_audit.branch_mgr` sub-permission slug on their CRM account (see the
  three-role-models section above) — a `profiles` row only matters for the
  Add-User/sync paths above, not for dashboard access itself. So if someone
  already has a CRM login, ticking that one checkbox in Admin > Users is the
  real fix; the migration just stops the DB from rejecting the profile-side
  writes that go along with it.

- **A boolean "cancelled" flag on a retryable capture is a one-way door.**
  `ArrivalCameraModal`'s `retake` set `cancelledRef = true` — to disown a confirm
  whose `uploadPhoto()` retry was still in flight — and never cleared it. Since
  `handleConfirm` checks that flag *after* the upload, the first Retake swallowed
  every subsequent Confirm for the life of the overlay: the modal stayed open,
  the button cycled Uploading… → Confirm, and no arrival was ever recorded.
  Retaking a photo is the most ordinary thing a field worker does here, so that
  one stale boolean was a silent dead end between "on the way" and "at site"
  (fixed 2026-08-26). It is now a per-attempt COUNTER, which is the shape this
  needs: a flag can say "this attempt is abandoned" but has no way to say "the
  next one is live". `camGenRef` next to it was already a counter for exactly
  this reason — copy that, not the flag.
- **Never disable a field app's only forward control on a permission or device
  probe.** The same modal's shutter was `disabled={!cameraFailed && !camReady}`,
  and `getUserMedia` can neither resolve nor reject — an Android webview with a
  pending permission sheet, or a camera another app holds, just leaves the
  promise open. `camReady` then stays false forever and the worker is left with
  Cancel as the only live button, unable to mark themselves at site at all. The
  shutter is now never disabled: it shoots the live preview when there is one and
  otherwise opens the OS camera, with a 6s watchdog that relabels it. The
  `material-depot-site` PWA always had this fallback (`snap.onclick` →
  `nativeCapture()`); the port dropped it. Related: bind a MediaStream to the
  `<video>` in an effect, not at the `getUserMedia` callsite — the element is
  unmounted while `cameraFailed` is set, so a late grant assigned `srcObject` to
  a null ref and left a black preview behind a live button.
- **`if (busy) return` where `busy` is state is not a lock.** Two taps inside one
  tick both read it as false and both write — one status change, two identical
  log lines. `advanceStatus` (`SiteInstallerApp`), `adv` (`SiteAuditorApp`) and
  the arrival modal's confirm all had this shape; each now holds a ref, with the
  state kept only for the disabled styling. This is the *write-side* half of the
  duplicate-log problem the Analytics dedupe guard compensates for on the read
  side — see the log-duplicate landmine above. A failed upload must also never
  fall back to embedding base64 in `log[]`: that column is fetched in full by
  every poll and has no slim view (7 live entries, ~30-50 KB each).
- **A re-assignment must only reset the assignees whose work actually changed.**
  `AssignSection.saveAssign` resets each saved assignment to `assigned`, which was
  added to stop a re-assign after a reschedule leaving `status:'reschedule'` on an
  assignment under a sub-job that said `assigned` (the field app reads the
  installer's own status, so that drift showed them "To Reschedule — nothing to
  do"). Resetting **every** assignee is the opposite bug and the one the field
  sees: the SM re-opens the form to add a second installer or fix a note, and a
  colleague already On The Way is yanked back to "Call the customer". They confirm
  again, the next edit resets them again. `ENQ2026071780139` collected 32 "on the
  way" entries on 2026-08-26 in bursts that each begin seconds after an SM
  re-assignment. Now scoped to assignees who are new to the sub-job, whose
  date/slots moved, or who still carry `reschedule`; `completed` stays terminal.
- **Only the PRIMARY installer writes `sj.status` — everyone else's progress
  lives on their `assignments[]` row, and nothing in Install Ops used to read
  it.** So the dashboard showed "At Site" on `ENQ2026082087114` while its own
  timeline said "Flooring installation done (additional installer: Ankit
  Sharma)" seven times over: both were true, and only one was on screen. There
  is now ONE derivation — `assigneeStatus` / `subjobDisplayStatus` /
  `assigneeProgress` in `install-ops/shared.ts`, mirrored by
  `subjobEffectiveStatus` in `SiteInstallerApp.tsx` — and every sub-job status
  the SM sees goes through it, so the badge, the calendar, the drawer and the
  order row cannot disagree. Three rules it must keep: a sub-job rolls up to
  `completed` only when **every** assignee is (one installer finishing must not
  bill the OMS service leg, which is gated on the parent rollup, nor skip the
  customer signature); `partial` and `completed` are never overridden (`partial`
  states that rooms are still outstanding); and `mapInstallRow`'s
  `reconciledOrderStatus` only ever moves an order that is stuck on a TRAVEL
  status, because `pending`/`deliv_*`/`created`/`call_na` are pre-service states
  no sub-job speaks to and an SM's deliberate `partial` is theirs to keep. On
  live data that reconciliation moves exactly 1 order and 1 sub-job badge, while
  surfacing 23 installer rows whose own status had been invisible. The
  `material-depot-site` PWA had the same split *and* fed it into the field app's
  own `loadJobs`, which is the worse half — see note 119 there.
- **`audit_ticked` is excluded from `AUDIT_COLS` for good reason, but
  `mapAuditRow` hardcoding `auditTicked: null` silently disabled every category
  display in the audit ops views.** The Categories column and the pre-booking
  drawer could only ever fall through to `o.service`, i.e. `—` on anything
  pre-service. And the store's own ticks never reached the audit at all: the two
  halves of one job are two rows (see the pre-booking section above), the store
  records the material on the reservation, and the audit row is created later by
  `autoImportAuditOrders` from an OMS order whose only SKU at that point is the
  audit service line — so `tickedCategories` yields `[]`, as it has on every live
  pending audit. Fixed 2026-08-26 with `AUDIT_CATEGORY_QUERY` — a second, narrow
  select over `PRE_CARD_STATUSES` only (210 rows / 36 KB / ~0.9s live, versus the
  full-table select that times out) whose last good result is held in a ref so a
  30s poll never repaints the table with the pills missing — plus a carry-over
  keyed on **the pre-booking's `po` === the audit's `pi`**, never the name or
  phone. It lands in a separate `storeCategories` field rather than being merged
  into `auditTicked`, because the two were ticked by different people and
  `categoriesAreFromStore` labels which one is on screen. **Do not "simplify"
  this by adding `audit_ticked` to `AUDIT_COLS`.**

## House style

- Comments explain *why*, especially the non-obvious constraint a line encodes —
  match the density of the surrounding file rather than adding narration.
- Prefer soft-gate-and-surface over hard-blocking: when data is missing, say
  what's missing and who fixes it (see the amber notices in
  `SiteAuditBranchManagerView`) instead of rendering a bare empty list.
- Reuse the existing status/stage registries (`install-ops/shared.ts` `STATUS`,
  `coe-ops/wpTrack.ts`) rather than re-declaring labels.
- New Site Audit drawers are built from `drawerUi.tsx` (`DrawerShell`, `Sec`,
  `KV`) rather than a fresh copy of the slide-over markup — `Sec`/`KV` had
  already been duplicated into two drawers before it existed.
