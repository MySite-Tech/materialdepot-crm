*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Status (end of 2026-10-28): Inbound, Outreach and Client DB built, KAM partly built. Pushed, not merged.

Several sessions worked this file on 2026-10-28 in the same working tree. All
of it is committed on branch **`b2b-revamp-2026-10-28`** and pushed to
`origin`. There is no PR and nothing is deployed. Continue on that branch.
`revamp-2026-10-28.md` lists its commits.

| Team | State | Where the detail is | Blocks real use |
|---|---|---|---|
| Inbound | **Built:** Team tab, CRM round robin, Mine/All scope, reassign, calls credited to the caller | §Inbound below; `inbound.md` §Who owns a lead | `b2b-team.sql` not applied; round-robin start date; first real Kylas owner change unverified |
| Outreach | **Built:** scoped views, From Inbound pool with sign-off, one-at-a-time lead entry with a capture gate (CSV import and export removed 2026-10-29), journey log, conversion check, KAM handover with WhatsApp gate; UI pass: clickable scorecard and work tiles over one table, period picker, BM chips from the data | §Outreach at the end; `outreach.md` | Same `b2b-team.sql`: until it runs there is no per-person scoping (everyone sees every BM's leads, amber notice) and the BM/KAM pickers use the old roster. Also the Studio Space waitlist read route upstream; until it exists waitlist reads Unknown |
| KAM | **Partly built:** the shared Firm page (slice 1) and lens tiles over firm and order tables (slice 3, minus Tier and Studio Space). Slice 2 and the rest are design only | §KAM below; `kam.md` | The Django repo's location (GST matching); the Meeting Coverage denominator |
| Leadership / My performance | **Built 2026-10-28 (not committed):** date-range KPI cards per person and per team for all three teams, a sortable compare table, day by day. Reps see only their own card, under "My performance" | `leadership.md` | `b2b-team.sql` (until then people are matched by name); unconfirmed: monthly frequency of Inbound/KAM revenue and qualified targets, KAM call target 40 vs `DAILY_CALL_TARGET` 10, the KAM coverage denominator |
| Client DB | **Built:** lens tiles (All · Active · Lapsing soon · Inactive · No KAM), filter chips, sortable columns, export scope honoured | `client-db.md` §The list | Nothing. Django: `b2b-bulk` serves a wrong `lastOrderDate` (future dates on many firms), which skews Active/Inactive. See `client-db.md` §The list |

The shared identity layer every team builds on is `lib/b2b/team` (types and
rules) plus `lib/server/b2b-team` (server only). Its source is the
`b2b_team_member` table, edited under B2B Sales → Team. On 2026-10-28 all ten
B2B sub-tabs rendered with no page errors, for both a manager and a rep, on a
local build. Django was stubbed there; Kylas and Supabase were real, with
every write blocked.

Started 2026-10-28. This is a multi-session, multi-window redesign of the B2B
Sales tab's information flow and UI — **scope is internal to this CRM only**.
The partner-dashboard bridge (`partner-bridge.md`, client logins, referral
sync) is a separate, already-designed initiative and is explicitly **out of
scope** here; do not merge the two.

**Read this file before touching any `components/b2b/**` file for this
initiative, and update it in the same commit as any change it describes** —
same parity rule as every other doc in this repo (see root `CLAUDE.md`).

## The problem, as stated by the user (2026-10-28)

Three teams work B2B Sales: Outreach, Inbound, KAM. Two complaints, roughly
equal weight:

1. **Information flow is wrong** — not just cosmetic. Data/context does not
   carry cleanly across teams or roll up correctly.
2. **The UI is hard to grasp.**

Target end state: **managers can see each team's effort and output**, and
**individuals can see their own effort and output**, inside the main
Material Depot CRM (not a separate app).

## Audit findings (2026-10-28, read-only, no code changed)

Source: full-repo read of `components/b2b/models/roster.ts`,
`views/b2-b-sales-crm.tsx`, all five per-team views (`views/inbound`,
`views/outreach`, `views/kams`, `views/leads`, `views/client-db`),
`views/dashboard`, `views/leadership-board.tsx`, `views/targets.tsx`, and
`docs/b2b/{inbound,outreach,kam,data-layer}.md` + `docs/landmines.md`.

- **No manager role exists.** `roster.ts` defines only `KAM | Inbound |
  Outbound | Admin`. `B2B_ADMINS` is one hardcoded person
  (Krishna Bhagavatula) with all targets at 0.
- **Zero view-level access gating anywhere in B2B.** `b2-b-sales-crm.tsx`
  renders all 9 sub-tabs unconditionally for anyone who reaches B2B Sales.
  The only role branch found repo-wide is `targets.tsx:98`, and it only picks
  which *columns* to render for a KAM row — not an access check.
- **Every per-team table is a global, all-reps list**, defaulted to an
  `owner`/`bm`/`kam` filter of `'all'`: Inbound, Outreach, KAM, Leads, Client
  DB. None scopes to the logged-in user by default. There is no "my
  worklist" anywhere — a rep sees everyone's rows and must filter manually.
- **No cross-team lifecycle view.** The Leads tab merges Inbound + Outreach
  only (not KAM). The Inbound→KAM "handoff" is a dropdown field captured at
  `Closed` status (`inbound.md:191`), not a persisted structured handoff
  record — source team is a split flag (`kam.md:131`), not a timeline.
  Seeing one client's full history means visiting three tabs.
- **Dashboard (`views/dashboard/index.tsx`) is org-wide only** — revenue,
  pipeline funnel, client health, `KamDashboard` — none of its ~30 state
  variables are person- or team-scoped.
- **Leadership Board is real, not decorative, but incomplete as "the manager
  view":** a genuine per-rep leaderboard (Inbound/Outreach/Clients/Revenue
  counts, top clients by revenue/orders, pipeline funnels). Gaps: (a)
  **output-only** — no effort metrics (calls made, meetings held, follow-ups
  completed); (b) visible to every B2B user, not manager-gated; (c) no
  individual counterpart — a rep sees the same all-reps table as everyone
  else, never "just my numbers."
- **Landmine to not reintroduce**: the Leads tab once offered every
  salesperson org-wide, so a B2B rep's cart read as a retail branch's leads
  (`docs/landmines.md` entry ~line 854). Any new role/visibility model must
  keep branch/team scoping airtight — this exact shape has already broken
  production once.
- **Reuse, don't re-derive**: the `B2BBulk.ok` gating pattern
  (`docs/landmines.md` ~line 618) for "a dropped call reads as a confident
  zero" — any new manager rollup must use it, not a fresh derivation.

**Conclusion: this is greenfield for role/visibility design, not a patch on
an existing permission model.** There is nothing to preserve in the access
model — only the data and the five existing tab views, which stay as the
underlying data sources even if their presentation changes.

## Decisions (resolved 2026-10-28)

- **No new role, no new people.** "Manager" is not a `B2B_ROSTER` value and
  not a new person — every B2B user is already a real CRM employee login.
  Manager-ness is granted to an **existing** user through the CRM's existing
  Admin tab user-management screen
  (`components/crm/admin/{dashboard,permissions}.tsx`), the same mechanism
  that already grants every other tab/sub-role permission in this app.
- **Manager is additive, not exclusive.** It is a flag/sub-permission layered
  on top of a person's existing team assignment (Inbound/Outreach/KAM), not a
  fourth mutually-exclusive category. A manager keeps their own individual
  queue if they have one; nothing forces a manager to stop being an IC.
  Follow the **Site Audit sub-role pattern already in this codebase**
  (`site_audit.admin`, `site_audit.bm`, etc. — sub-slugs inside the same flat
  `individualPermissions` array, rendered as extra checkboxes/radios under
  the tab's checkbox in `permissions.tsx`), not a new permission shape.
  Concretely: add `b2b.manager` (and whatever team sub-slugs are needed,
  e.g. `b2b.inbound` / `b2b.outreach` / `b2b.kam`) under the existing
  `crm.b2b_sales` tab permission. The CRM shell already has unused role
  vocabulary for this (`b2b_sales`, `b2b_KAM`, `b2b_manager` in
  `components/crm/constants.ts:100-102`) — reuse/extend it rather than
  inventing a parallel vocabulary.
- **Superseded for team membership (2026-10-28)**: the bullet above still holds
  for *manager* (`b2b.manager`), but team membership moved to the
  `b2b_team_member` table that managers edit. No `b2b.inbound`/`b2b.outreach`/
  `b2b.kam` slugs exist; see §Team membership below.
- **`components/b2b/models/roster.ts` (`B2B_ROSTER`, 11 hardcoded names +
  phone numbers, never linked to a real login) is being retired.** B2B must
  read the real user list the same way the rest of the CRM does
  (`lib/api/crm/users.ts` → `/user-organisation/`, already fetched for the
  Admin tab) and derive team/manager status from `role` +
  `individualPermissions`, matched to the logged-in session. Do this
  migration **before** building any new view on top of it — a manager/
  individual split built against the fake roster would need redoing.
  Watch the phone-matching trap already documented in `partner-bridge.md`
  (normalise to last 10 digits, exact match only, never substring) if
  reconciling old roster data (e.g. targets) against real users by phone.
- **The individual's "my effort + output" view is a new dedicated view**
  (a "My Dashboard"-shaped sub-tab inside B2B Sales), not a default-filter
  change on the existing Inbound/Outreach/KAM/Leads tables. Built
  person-scoped from the start.
- **Leadership Board gets rebuilt, not just gated.** The user has **new
  KPIs, roles and metrics already defined** for judging performance across
  all three teams — not yet shared with this session (see blocking question
  below). The rebuilt view is for judging performance (effort + output per
  person/team, the manager-facing side). Separately, the existing
  **Dashboard tab should lean more business/numbers-first** (org-level
  revenue and pipeline state) — i.e. Dashboard and the
  rebuilt-Leadership-Board end up answering two different questions
  ("what's the business doing" vs "how is each person/team performing"),
  not one blended view. Exact KPI list still needed before this can be
  designed or built.

## KPIs: received 2026-10-28

The user's KPI/role/metric definitions are now transcribed in
[`kpi-definitions.md`](kpi-definitions.md), pulled from their "Studio Team
KPI" Google Sheet. **Read that file before designing any effort/output view
for Outreach, Inbound or KAM** — do not re-derive or guess at metrics; the
sheet is the source of truth and may be updated by the user independently of
this repo. Headline shape: every team has an **Efforts** set (activity,
largely self-logged — calls, meetings, CRM adherence %) and an **Output**
set (results that must be *computed from CRM data*, not hand-entered —
revenue, conversion counts, Active Account Rate). `kpi-definitions.md`'s
closing section lists what this implies for the data model (new required
fields, a real round-robin-handoff-with-sign-off primitive needed across all
three team boundaries, new dead-lead automation, a shared CRM-Adherence-%
pattern) — read it before step 2 of the build order below, not just before
step 4, since the handoff/field gaps affect the roster migration too.

## Inbound: the brief (2026-10-28) and the design built from it

First sub-tab brief. Source: the user's message plus `kpi-definitions.md`
§Inbound (sheet rows 12–16). Not built yet.

### Visibility, for all three teams

| Who | Inbound tab | Outreach tab | KAM tab |
|---|---|---|---|
| Rep | **Mine by default, all inbound one toggle away**, and may reassign | Own leads only | Own firms only |
| Manager (`b2b.manager`) / Admin | Everything, with a per-person filter | Same | Same |

Inbound is open on purpose: when one rep is out, another takes the lead over
and puts it in their own name. Outreach and KAM are hard-scoped.

**Scope belongs in the fetch, not in a filter.** Today the owner filter
defaults to `'all'` and a rep can change it. "Mine" has to be the `ownerIds`
handed to `fetchInboundBoard`, or a rep's numbers are only right while nobody
touches the filter. Also: **the Kylas proxy is reachable by anyone who can
reach the B2B tab**, so a client-side scope is a focus aid, not
confidentiality. If reps must not be *able* to read each other's leads, the
proxy needs `requireCaller` plus a server-side owner check. That is a separate
decision.

### Team membership, identity and round robin: built 2026-10-28

The user answered the open questions:

- **Round robin runs in the CRM.** Fixing it in Kylas was tried and failed.
- **Nothing hardcoded.** Managers put existing CRM users onto teams, and people
  will keep joining and leaving.
- **Calls target is 90/day.** The sheet's 1500 is wrong.
- **Outreach/KAM get a scoped view, not a server-side block.**

That changed one earlier decision. **Team membership is a CRM-Supabase table,
`b2b_team_member`, not `individualPermissions` sub-slugs.** Two reasons:
managers, not only admins, must edit it, and the Django user endpoint is an
admin screen; and each person needs a Kylas user id stored somewhere anyway.
Manager-ness *does* stay a permission: the `b2b.manager` slug, or role
`superadmin`/`admin`/`b2b_manager`, via `isB2BManager`. No `b2b.inbound`-style
team slugs were added.

What exists, all documented in `inbound.md` §Who owns a lead:

- `supabase/migrations/b2b-team.sql`: `b2b_team_member` (keyed on the last 10
  digits of the phone, which is the one id the session, `requireCaller` and
  `/user-organisation/` all share) and `b2b_lead_assignment`. **Not applied yet.**
- `lib/b2b/team/`: shared types, constants and pure rules (`canUseB2B`,
  `isB2BManager`, `viewerFor`, `rotationOrder`, `planRotation`), plus the
  route client. `lib/server/b2b-team/`: Supabase and Kylas, server-only.
- `app/api/b2b/team` (GET for any B2B user; PUT and the Kylas user list for
  managers) and `app/api/b2b/inbound/assign` (`rotate` for any B2B user,
  `reassign` for inbound members and managers). Every rejection was curled
  against the Django stub.
- **Kylas user ids are found by phone.** `GET /users` returns all 185 users
  with phones and an `active` flag (checked 2026-10-28). A manager can
  override the match by hand.
- B2B shell: gets `currentUser`, loads the team once (one request), and builds
  a `Viewer`. It passes `team` and `viewer` to every sub-tab that scopes;
  Outreach already consumes them. The Team sub-tab is manager-only.

**Verified on 2026-10-28, against the stubbed Django and real Kylas/Supabase.
Team reads were stubbed, and the rotation POST was stubbed in the browser run:**

- The planner, run on real lead ids, skips paused, removed, unlinked and
  non-inbound people.
- Inbound still costs 2 requests on open (3 once the round robin has members).
- "Mine" hides the owner filter, and "All" lists team names.
- The drawer's Owner card names the current owner and leaves them out of the
  hand-over list.

**Not verified:** a real Kylas owner change. Nothing was written to Kylas or
Supabase.

### The working surface: the Today view becomes the rep's day

**Layout done 2026-10-28.** The tiles are now clickable lenses, and the First
call tile is the "New = 0" countdown. See `inbound.md` §The tiles are the
navigation. The log-call modal and Dead derivation below are still to do.

Every KPI below is meant to fall out of normal work, not to be filled in later.

- **Log call is the primary action.** Call status (RNR / Connected), note
  (mandatory) and next follow-up date (mandatory) go in one modal. On
  Connected it also asks client type, segment, requirement and lead stage.
  The sheet's adherence fields are asked at the moment they become known,
  never as a separate form.
- **New = 0 by end of day** is the headline on the rep's day: a countdown of
  untouched assigned leads, not a column to scroll.
- **Dead leads are derived on read**, the same way `normalizeStatus` already
  is, because there is no scheduler and this repo has twice shipped a
  migration nobody ran. The rule is in `kpi-definitions.md`. The current code
  contradicts it in two places: `MAX_CALL_ATTEMPTS` is 4 against the sheet's 5,
  and there is no `Dead` status. Whether 7 days is calendar or business days
  is open.

### Inbound KPIs: what each is computed from

| KPI | Type | Computed from | Missing today |
|---|---|---|---|
| Coverage (daily) | Effort | leads assigned on D with ≥1 `CallAttempt` on D ÷ leads assigned on D | assignment record (date) |
| Calls / day (target 90) | Effort | `CallAttempt.at` on D, grouped by **who made the call**, not who owns the lead | done: `by` is the session user since 2026-10-28; older rows hold the owner |
| CRM adherence | Effort | mandatory fields + same-day log ÷ leads handled; **one shared function** for all three teams | segment, GST, address fields; identity |
| Revenue | Output | `orderValue` of Closed leads by owner at close, plus EC orders via §3.5 Placed-under | owner-at-close snapshot |
| Qualified for Outreach | Output | handoff records Outreach signed off, counted only after conversion or 2 Outreach follow-ups | the handoff record itself (shared with the Outreach brief) |

Effort KPIs are credited to whoever did the work (the call's `by`). Output KPIs
are credited to the owner at the moment of the outcome. A reassigned lead
therefore splits cleanly: the calls stay with the rep who made them, and the
order goes to the rep who closed it.

### Inbound build slices

1. ~~Pass `currentUser` into `B2BSalesCRM` and resolve the Kylas id.~~ Done.
2. ~~Mine/All scope plus a reassign action (writes the assignment record).~~ Done.
3. ~~Round robin.~~ Built; the first real run is pending the migration.
4. Log-call modal, mandatory fields, Dead derivation.
5. Personal KPI strip on the Today view; per-person table for managers.

## KAM: the brief (2026-10-28) and the design built from it

Second sub-tab brief. Source: the user's message plus `kpi-definitions.md`
§KAM. Not built yet.

**The job:** a KAM is the relationship owner for firms that are already active
plus firms Outreach has just converted. They onboard them to Studio Space,
manage the account, take more orders, meet them regularly and log every
meeting. The user asked for three things: a cleaner UI, filters for judging
a KAM's performance, and an admin view that can filter across everything.

### Decisions (resolved with the user 2026-10-28)

- **One Firm page, two lists.** A single Firm page (contacts, GSTs, orders,
  meetings, Studio Space, tier) is used by both tabs. The **KAM tab** is a KAM's
  own book. **Client DB** stays as the managers' master list: unassigned firms,
  assignment, merge, bulk upload. The page replaces both `views/kams/drawer.tsx`
  and Client DB's expanded row, which today render the same firm two ways.
- **Active / Inactive is `clientStatus`, unchanged.** The brief's rule ("any
  order in the last 3 months") is what it already computes, anchored to today
  (see `client-db.md`). Do not write a second one.
- **Power user / Normal user is a label, set by `b2b.manager` only.** KAMs see it
  and cannot change it. It applies to Active firms only; on an Inactive firm it
  is kept but shown greyed out. It is **not** derived from studio.materialdepot.com
  usage: the user said the two are not interconnected. Stored in the client row's
  `meta_data` as `{ tier, by, at }` plus a history array. That column is JSONB,
  so no migration is needed. Every change is logged with who and when, so the
  admin view can filter on it.
- **Inactive reasons** (user accepted this list): No active project · Buying
  elsewhere (price) · Buying elsewhere (range/availability) · Service/delivery
  issue · Credit/payment issue · Unreachable · Firm closed/merged · Other (note
  required). Asked of an Inactive firm, never of an Active one.
- **Matching orders by GST needs Django.** The user says someone has the
  Django repo. It is not on this machine (no `manage.py` under `~/Projects`).
  The contract is below.

### One conflict with the KPI sheet, flagged and not resolved

`kpi-definitions.md` says Meeting Coverage and Active Account Rate share one
definition of "active": at least one confirmed order **in the month**, reset
monthly. The brief above defines a firm as Active on **3 months** of orders.
These are two different numbers, and both stay:

| Name on screen | Rule | Used by |
|---|---|---|
| Firm status: Active / Inactive | `clientStatus`: any order in the last 3 months, anchored to today | Firm lists, filters, tier eligibility, inactive reasons |
| Ordered this month | at least one placed order in the calendar month | Active Account Rate KPI (new-handover and old, split) |

Never label "Ordered this month" as "Active". The open question is which of the
two is the denominator for Meeting Coverage. The proposal is firm status
(3 months), because "met X% of my active firms" should not drop to zero on the
1st of every month. Needs the user's confirmation.

### Orders, structurally

The Firm page's order panel still fetches **one request per phone**
(`fetchClientTickets`, pooled 4-wide, cached per phone) when a firm opens. The
phone-only half of the list below shipped on 2026-10-28: the Orders · Open ·
Lost tabs, the strip, the Via column and paging. The GST half and the single
request still wait on Django. The rebuild:

- **A firm's orders are the union over every contact number and every GSTIN on
  the firm**, deduplicated by ENQ id. Each row names the key that matched it
  ("via 98xxxxxx12", "via GST 29ABCDE…"), so a KAM can see why an order is
  attached to the account. Phone matching stays exact, with the drops counted,
  as today.
- **Three tabs inside the panel: Orders (placed) · Open (carts/quotes) · Lost**,
  each with a count. A summary strip above it shows Lifetime revenue,
  Last 3 months, Orders, AOV, Last order and days to inactive, and Open pipeline.
  The strip counts the full set; paging the rows never changes it
  (house-style rule).
- **Columns:** ENQ id, Placed on, Value, Status, Via, Company on order, Branch /
  SPOC. Contact appears only when the firm has more than one number. The panel
  pages at 25 rows. Company/GST-on-order columns appear only once Django returns
  them, never as a placeholder.
- **One request when a firm opens**, carrying that firm's phones and GSTs, in
  place of N per-phone calls.

### Django contract (backend-first; the CRM degrades to phone-only without it)

Extend `GET /crm/leads/b2b-bulk/` (already called via `fetchB2BBulkApi`):

- New param `gsts=` (comma-separated). Normalise to uppercase alphanumerics and
  match **exactly** on `estimate.client_gst`, never `icontains`: the phone
  `icontains` trap in `client-db.md` must not be repeated.
- New param `include=tickets` returns a `tickets` array:
  `{ id (ENQ, from estimate.lead_id), clientPhone, clientName, cartValue,
  status, createdAt, orderPlacedAt (estimate.order_placed_time), branch,
  assignedTo, clientGst, gstCompanyName (user_gst.gst_company_name),
  matchedBy: 'phone' | 'gst' }`.
- `histories` gains GST keys alongside phone keys, so list-level revenue covers
  GST-only orders without fetching tickets.

The data behind it was checked read-only in Metabase (`materialdepot_azure`) on
2026-10-28, aggregates only:

| | |
|---|---|
| `estimate.client_gst` set | 16,399 of 163,277 estimates; 8,972 of the 43,003 created in the last 6 months |
| Shape | all 16,399 are 15 characters once normalised; 2,933 distinct GSTINs |
| **GSTINs spanning more than one customer account** | **253** (37 span 3 or more). These are the orders a phone-only match misses |
| `estimate.lead_id` | present on all but 2; ENQ-shaped on 15,978 |

`user_gst.gst_company_name` is a registered company name per GSTIN in MD's own
DB. Returning it partly answers `client-db.md`'s "there is no GST Validator",
for GSTINs that MD has seen before.

### Identity: whose firm is it

`b2b_lead.owner` on a client row is the KAM's **display name**, while the
session identity (`b2b_team_member`, see `lib/b2b/team`) is a **phone**. "My
firms" therefore needs the KAM's phone stored on the firm (`kamPhone` in meta;
`owner` stays the name, because analytics reads it). It needs a one-time match
of the existing owner names to `team='kam'` members, with unmatched rows
reported, never guessed. Visibility is as in the table at the top of the
Inbound section: a KAM sees only their own firms, and a manager sees all with a
per-KAM filter. Scope goes in the Supabase query, not in a dropdown.

### KAM KPIs: what each is computed from

| KPI (target) | Computed from | Missing today |
|---|---|---|
| Account meetings (35/month) | Meeting interactions in the month, by `loggedBy` | `loggedBy` as session identity; attendees and purpose fields |
| Meeting coverage (50%) | unique firms met ÷ firms in the denominator above | the denominator decision |
| Calls (40/day) | `callsLoggedOn`, unchanged (distinct firm per day) | identity |
| Ordered-this-month rate: new handovers (100%), old (60%) | placed orders in month across the firm's phones and GSTs | handover date per firm (from the Outreach→KAM handoff record) |
| Revenue (50 L) | placed order value in month, same union | GST half needs Django |
| Studio Space onboarding (25%) | firms marked Onboarded ÷ assigned firms | Studio Space status field (`{ status, at, by, link }`, set by the KAM) |
| CRM adherence | the shared adherence function (Inbound section) | team size field |

Revenue is credited to the firm's KAM **today**. Nothing records who held the
account when the order was placed, so a reassigned firm's history moves with it.
Same caveat as `client-db.md` §3.2, and it must be shown on screen.

### KAM build slices

1. **Firm page** (shared component): header with status, tier and Studio Space;
   contacts and GSTs; restructured orders panel; meeting/call timeline. Phone
   matching only until Django ships. No dependency on identity.
   **Built 2026-10-28** as `components/b2b/drawers/firm/`, used by both Client
   DB and the KAM tab, with inline add/remove of numbers and GSTINs (see
   `client-db.md` § The Firm page). Not in it yet: tier and Studio Space, which
   wait for slice 6 and the Studio Space field. The meeting/call log is the KAM
   tab's existing one passed in as a child, not yet a shared timeline.
2. **Identity and scope:** `kamPhone` backfill, `team`/`viewer` passed into
   `KAMs`, own-firms scope in the query.
3. **KAM tab list:** one paginated firm table with filter chips (Status, Tier,
   Studio Space, Due today, Overdue, plus KAM for managers). Today/Queue become
   chips, not separate views.
   **Mostly built 2026-10-28** as clickable tiles (see `kam.md` §The tiles are
   the navigation). Status, Due today and Overdue are tiles, and the KAM picker
   stays. Tier and Studio Space wait on slice 6 and the Studio Space field, and
   the KAM picker is still a free choice until slice 2 scopes it.
4. **Log meeting/call modal:** attendees, purpose, notes and next follow-up all
   mandatory; `loggedBy` comes from the session.
5. **Manager performance view:** per-KAM KPI table with a month picker,
   filterable by tier, status, Studio Space and segment.
6. **Tier (manager-only) and inactive reasons.**
7. **GST matching**, once the Django contract above is live.

Request budget on KAM tab mount: team, clients, KAM orders, b2b-bulk = 4.
Opening a firm adds 1.

## Open / blocking (as of 2026-10-28)

- **B2B data off Supabase.** The user reports it now lives on the Django
  backend, but every B2B read and write still goes to Supabase `b2b_lead`,
  `b2b_target` and `b2b_team_member`. Blocked on the Django endpoints. The
  table of what has to move, and the switch point (`lib/b2b/data/`), are in
  `docs/backends.md` § Pending.
- **Where the Django repo is, and who changes it** (KAM slice 7). The user
  says someone has it.
- **Meeting Coverage denominator:** 3-month firm status or ordered-this-month
  (see the KAM conflict above).
- ~~Inactive-account reason taxonomy~~: resolved 2026-10-28, list in the KAM
  section.
- Does the lifecycle view (one client across inbound→outreach→KAM) become a
  new view, or a drawer/panel reachable from Client DB? Partly answered: the
  Firm page is the natural home for the KAM half.
- **Process note, not a blocker**: the user will define each B2B Sales
  sub-tab individually, across separate future sessions/windows — this doc
  is the continuity layer between those sessions, not a spec to implement
  end-to-end in one pass. A new session picking this up should read this
  file + `kpi-definitions.md` first, then wait for the user's specific
  sub-tab brief for that session rather than assuming it should tackle the
  next build-order step unprompted.

## Build order (revised 2026-10-28 per decisions above; progress marked end of day)

Progress: step 1 is done as `b2b.manager` only, with team membership in
`b2b_team_member` instead of slugs. Step 2 is done for Inbound and Outreach;
KAM lists and Targets still read `B2B_ROSTER`. Step 3 was
built per team as each tab's own scope ("Mine", "My day"), and the
cross-day view of it is "My performance" (step 4). Step 4 is built (see
`leadership.md`). Steps 5–6 have not started.


1. **Permission plumbing** — add `b2b.manager` + team sub-slugs under
   `crm.b2b_sales` in `individualPermissions`, following the Site Audit
   pattern in `permissions.tsx`. Admin tab can now actually grant this to a
   real user. No B2B-facing UI change yet.
2. **Retire `B2B_ROSTER`** — swap every `components/b2b/**` read of the
   hardcoded roster for the real user list (`lib/api/crm/users.ts`), deriving
   team/manager from `role` + `individualPermissions` resolved in step 1.
   This is a prerequisite for steps 3–5, not parallel work.
3. **Individual view** — new "My Dashboard"-shaped sub-tab, hard-scoped to
   the logged-in user via the real identity from step 2.
4. **Leadership Board rebuild.** Built 2026-10-28 as `views/leadership/` over
   `models/performance/`. Managers get every person, and reps get their own
   card under the label "My performance". See `leadership.md`.
5. **Dashboard tab rework** — shift toward business/revenue/pipeline
   numbers now that Leadership Board owns per-person/team performance;
   scope once step 4's shape is known so the two views don't re-overlap.
6. **Lifecycle view** — one client/lead across inbound→outreach→KAM.
   Placement (new view vs. drawer off Client DB) still undecided; revisit
   after step 4.

## Session log

- **2026-10-28**: Scope confirmed with user (internal CRM only, not the
  partner bridge). Read-only audit done (see Findings above). No code
  changed. Next session should start by resolving the Open Decisions above
  with the user before writing any component.
- **2026-10-28 (same day, cont'd)**: Closed the role-model decisions (no new
  role/people; manager is an additive permission on an existing user via the
  Admin tab's existing permission mechanism, following the Site Audit
  sub-role pattern; `B2B_ROSTER` to be retired in favor of the real user
  list). Pulled the user's KPI sheet into `kpi-definitions.md`. No code
  changed yet — still planning. User intends to hand off this doc across
  multiple future sessions, each covering one sub-tab at a time.
- **2026-10-28 (Inbound brief)**: Merged `origin/main` (30 commits, including
  inbound owners Praful/Vikas/Krishna/Vilok and an inbound table rewrite).
  Re-pulled the KPI sheet; targets had changed, see `kpi-definitions.md`.
  Wrote the Inbound design above. Waiting on: where round robin lives, the
  inbound pool's members, the calls target, and calendar vs business days.
- **2026-10-28 (KAM brief)**: Wrote the KAM design above. The user chose: one
  Firm page shared by both lists, tier set by managers only, and the proposed
  inactive-reason list. Metabase confirmed `estimate.client_gst` can drive GST
  order matching (253 GSTINs span several customer accounts). No code changed.
  The parallel session's identity layer (`lib/b2b/team`, since committed) is what
  KAM slice 2 builds on. Waiting on: the Django repo's location and the
  Meeting Coverage denominator.
- **2026-10-28 (Inbound, build)**: The user chose CRM-side round robin,
  manager-edited membership (nothing hardcoded), 90 calls/day, and scoped views
  for Outreach/KAM. Built slices 1–3 (see §Team membership above).
  `b2b-team.sql` is **not applied**, and the Kylas owner PATCH has not been
  exercised on a real lead. A parallel session is building Outreach on the
  same `lib/b2b/team` layer.
- **2026-10-28 (Inbound, layout)**: The user asked for clickable tiles that list
  the leads behind them, and a less cluttered Today. Each tile is now a lens with
  one predicate for its count and its list. Today and List merged into one paged
  table, and the side panels are gone. Verified against real Kylas/Supabase with
  Django stubbed and every write blocked. Every tile's count matched its rows.
  No data change. Found 130 follow-up leads with no date.
- **2026-10-28 (KAM, tiles)**: The user asked for clickable KAM tiles. Waited for
  the parallel KAM session to commit the Firm page (`7eb283e`) before editing.
  Built slice 3's list as nine lens tiles over one paged firm table and one paged
  order table. The tile component moved to `components/b2b/ui/lens-tiles.tsx`,
  shared with Inbound. The Outreach session has its own `LensStrip` in
  `views/outreach/lenses/`, which should move onto it. It is committed in
  `818f516` and has not been moved yet.
- **2026-10-28 (Client DB, layout)**: The user said clicking the Active/Inactive
  tiles "is not coming right" and asked for clearer filters. The tiles had no
  click handler, and a status dropdown zeroed them. They are now lenses on the
  shared component, with chips, highlighted filters and sortable columns. Every
  tile's count matched its list in a browser, with Django stubbed and writes
  blocked. The whole day's work was pushed as `b2b-revamp-2026-10-28`.

- **2026-10-28 (Leadership Board)**: The user asked for the board to be
  rebuilt from scratch: a date-range summary of every person on KAM, Inbound
  and Outreach, effort and output per day, a by-person comparison for admins,
  and reps seeing only their own numbers under "My performance". Built one KPI
  engine per team. Outreach wraps `outreachKpis`; Inbound and KAM are new, from
  `kpi-definitions.md`. The old leaderboard, funnels and top-client lists are
  gone. Checked in a browser as a manager, an Outreach BM and an unknown user,
  on real Supabase and Kylas reads with Django stubbed and every write
  blocked. No write was attempted.

## Outreach: the brief (2026-10-28) and what was built

Source: the user's message plus `kpi-definitions.md` §Outreach (sheet rows
4–11, re-pulled the same day, targets unchanged). **Built**, in a separate
session from Inbound, on the shared `lib/b2b/team` identity layer. Full detail,
including every data call, is in [`outreach.md`](outreach.md) §"The 2026-10-28
rebuild"; this is the decision record.

The brief, in the user's words condensed: Outreach's lead channels are the
Inbound team's leads, older inactive forms, and the BM's own research (manual
add or CSV upload with firm details). Log the whole journey and remind the BM of
everything. **Outreach ends at the first order** → Converted → ready for KAM
handover. BMs also get firms onto the **Studio Space waitlist**
(`studio.materialdepot.com/join`), matched back to leads. A **WhatsApp group is
required** for a proper handover to KAM.

Decisions taken (all overrulable; none is expensive to change):

- **No new table.** Intake, handover and journey live in the outreach row's
  `meta_data`. Nothing waits on an unapplied migration.
- **Inbound → Outreach is a pull, not a push.** Outreach reads Inbound's worked
  `b2b_lead` rows as a pool; Inbound needs no new button. Manager assigns
  (round-robin or per row), the BM accepts or rejects with a reason — that
  acceptance is Inbound's "sign-off required".
- **"Inactive forms" = leads entered by hand with `Source = Dormant form`.**
  No form integration was built; the forms were not identified. The CSV import
  that first carried them was removed on 2026-10-29 at the user's request.
- **Converted stays the stored `Closed`**, relabelled. Only an Enq-ID-fetched
  first order counts as a conversion; new revenue additionally excludes numbers
  that ordered in the 6 months before.
- **Handover hard gate** = WhatsApp group link + the sheet's payload; 48h KAM
  sign-off is tracked and shown overdue, never auto-escalated.
- **Meeting notes are a hard gate on a held meeting; the live pin is not.**
- **Waitlist matching is exact 10-digit mobile only**, read through the sync
  bridge. The upstream read route does not exist yet, so the waitlist KPI shows
  Unknown until it does.

Open, for the user:

- The upstream `GET /api/sync/waitlist` (partner app + Studio Space backend)
  needs building and deploying — contract in `outreach.md`.
- Which "existing forms that are inactive" are meant, if an integration rather
  than CSV upload is wanted.
- Whether a KAM accepting a handover should create the KAM-side client record
  (belongs to the KAM sub-tab brief).
- Should a manager's "Assign all round-robin" also run automatically on load,
  like Inbound's rotation? Not done: it writes, and this stack has no scheduler.

- **2026-10-28 (Outreach)**: Built the Outreach sub-tab rebuild above — scoped
  views, From Inbound pool + sign-off, CSV/Excel import, journey log, My day
  reminders, live pin, conversion verification + 6-month rule, KAM handover with
  WhatsApp gate and 48h sign-off, waitlist bridge (CRM half), per-head KPI strip
  and manager Team table. Checked with fixtures in Node and in the browser with
  reads intercepted and writes aborted; no production row written.
- **2026-10-29 (Outreach, capture)**: The user asked Outreach to capture team
  size, segment, an alternate number, the firm's people with their roles and a
  next follow-up date on every lead; to record each visit properly; and to drop
  CSV import and export so leads are entered one by one. Built as a capture gate
  shared by New lead, the drawer, the reminders and CRM adherence, plus "who you
  met" on held meetings. The Custom-range picker bug was fixed too. Detail is in
  `outreach.md` §What a BM must capture.
- **2026-10-28 (end of day, all sessions)**: Put the per-team status table at
  the top of this file and marked build-order progress. Checked the combined
  tree: `tsc` clean, branch level with `origin/main`, every B2B sub-tab
  renders for a manager and a rep on a local build. Still nothing committed:
  the user will choose the commit order. These two shared docs go in one
  commit; each session's code goes in its own.

- **2026-10-28 (Outreach, UI pass)**: The user found the Outreach tab too texty
  to navigate, its filters incomplete, and its KPI tiles not clickable. The page
  is now Inbound's tile-lens layout. A scorecard has a period picker and a
  By BM switch, and each KPI tile lists its leads, uncounted ones included with
  the reason. Below it, Action needed and Pipeline tiles sit over one paged
  table. Filters collapse into a panel with removable chips. `outreachKpis`
  now returns rows, and targets apply only to whole months. The BM picker had
  offered the 2-name roster while five other BMs held the 53 real leads (see
  `docs/landmines.md`). Checked on real `b2b_lead` reads as manager, and with
  fixtures as BM and KAM. Django was stubbed and no write was attempted. All
  11 work tiles matched their tables. No data change.
