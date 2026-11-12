*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Overview (was "Dashboard", rebuilt 2026-10-30)

**Covers:** `components/b2b/views/overview/**`

## Data

Unchanged from the Dashboard it replaced. The load rules (split by dependency,
date and branch basis, `basisApplied`) are in `data-layer.md`.

| Call | Endpoint | When |
|---|---|---|
| `fetchB2BData`, `fetchTargets` | B2B backend, through the 8 s B2B cache | On open (`readBase`) |
| `fetchB2BBulk`, `resolveKamOrders` | Django `/crm/leads/b2b-bulk/` | On open |
| `fetchRevenueReport` | `GET /api/b2b/revenue?from&to` | One per month picked. Server cache per caller, 5 minutes for the current month and 30 for past ones. Refresh bypasses it, for that read only: a month picked after Refresh uses the cache (before 2026-11-05 every later pick bypassed it, about 4 s each). Carries each order's whole ticket, so the drill-down below costs no request |
| `fetchRevenueTrend` | `GET /api/b2b/revenue/trend` | On open. The last six months' channel totals, built from the same per-month reports and cache, three months at a time (two until 2026-11-06). No orders in the response |
| `fetchEnquiryItems` | Django `/crm/leads/?enquiry_ids&include=boq` | Only when one enquiry is expanded, once per enquiry (`client-db.md` §One enquiry) |
| `fetchFunnelReport` | `GET /api/b2b/revenue/funnel?from&to` | Only once the Client Database funnel is opened (remembered per browser), then one per month picked; 5-minute server cache per caller. Reads `/crm/leads/?created_from&created_to` for the month, up to 30 pages of 1,000, 8 at a time |

## Four revenue channels (redefined 2026-11-03)

The user's definition, matching their Metabase logic. Every placed order gets a
**type** (1–8, the numbering in their "B2B Sales Data" sheet), and the type plus
where it was booked decides the channel (`lib/b2b/revenue/utils/classify.ts`):

| Type | Rep on the cart · number | Booked on the B2B branch | Booked at a store |
|---|---|---|---|
| 1 / 2 | A B2B rep | 1 → **Direct** | 2 → **Studio EC Redirected** |
| 3 / 4 | Store rep, a number B2B holds | 3 → **Direct** | 4 → **Studio EC Redirected** |
| 5 | A Studio Space referred client | **Referred** | **Referred** |
| 6 / 8 | Store rep, a Client Database firm with no KAM | 6 → **Direct** | 8 → **EC Direct** |
| 7 | Store rep, a number on no B2B record | 7 → **Direct** | ordinary retail, dropped |

- **The user's four, in their words (2026-11-03):** Direct is placed on B2B.
  Studio EC Redirected is firms with a B2B person on them (a KAM, an Inbound or
  Outreach SPoC) ordering at a store, so B2B sent them there. EC Direct is
  Client Database firms ordering at a store with no B2B SPoC: they deal with the
  store directly and have not explored a B2B tie-up. Referred is the end clients
  Studio Space partners refer. A number held only by an Inbound or Outreach lead
  counts as having a SPoC, and so does a logged redirect.
- **"The B2B branch" is HQ until 30 June 2026 and `B2B` (branch 70) from 1 July**
  (`B2B_BOOKING`). Branch 70's first order is 1 July. The user: "in June, B2B
  orders were taken on HQ". `readBooked` reads each era's branch with its window
  clamped to the era, so one report can straddle the cutover.
- **HQ is a store too, so type 7 does not exist there.** A walk-in at HQ on no B2B
  record is retail (`booked: 'shared'`). HQ kept booking 110–150 store orders a month
  after July with almost no B2B rep, and June held about a hundred such walk-ins.
- **Direct is every placed order on the B2B branch except referred clients.** From
  July, Direct plus the Referred card's "on the B2B branch" equals branch 70 in
  Metabase. Before 2026-11-03 Direct was "a B2B rep on the cart", and types 6 and 7
  were "not counted"; the not-counted line and the bridge table went with that.
- **Referred is every order of a referred client, wherever it was booked.** The user
  first listed type 5 under Direct, then asked to see referred clients' orders
  entirely separately. The Referred card splits its total by booking place, and the
  Direct card says how much referred revenue sat on the branch, so the Metabase
  figure can still be rebuilt from the screen.
- **Types 6 and 8 are the Client Database's firms with no KAM**, including the
  client_master import. Many of those designers bought at stores before anyone at
  B2B knew them, and the user wants that volume visible as EC Direct. A firm is
  matched by any of its numbers with no date gate, so its whole history counts.
  An order placed under a number the firm record does not hold (a site supervisor,
  the end client) is missed: there is no GST or name match.
- **The first match decides the type:** referred, then a B2B rep, then a number B2B
  holds, then a firm with no KAM, then the B2B branch.
- **The funnel keeps its cut** through `FUNNEL_OF` on the type: Studio direct is
  1–2, EC referred 3–4, EC direct 6 and 8.
- **`branch=HQ` on `/crm/leads/` has not been seen answering from real Django.**
  `branch=B2B` matches `organisation_branch.branch_name`, and HQ's name is `HQ`, but
  the first signed-in run over a June month should confirm Direct is not ₹0.

Checked 2026-11-03 by running the compiled classifier over every placed order from
June to 3 November (Metabase) against production's `/b2b/*` holders. From July,
Direct plus referred-on-branch equalled branch 70 in count and value every month,
and June's Direct equalled HQ less its walk-ins. The figures stay out of this
public repo. The route itself has run only on the sandbox.

- **The only bulk read of orders is `/crm/leads/?order_from&order_to&branch_basis=estimate&page_size=1000`.**
  It takes `page_size=1000`, unlike what `backends.md` row 8 assumed. October was
  3,855 rows in 4 pages, about 4 s with the `branch=B2B` read beside it. The row's
  `branch` is the rep's home branch, not the booking branch, so the second read
  marks `bookedOnB2B`. It runs in a route handler because it is 5+ requests.
- **A B2B rep is `row.branch === 'B2B'`, or an exact full-name match on the team or
  roster. Never `sameRep`.** Its prefix match made a team member equal to a store
  rep with the same first name and moved that rep's whole month into Direct. The
  two have different phones in `users_user`.
- **A lead or redirect counts only for carts raised on or after its date,** so a
  store customer who later became a lead is not claimed. Firms have no such gate.
- **The hero is at least the Orders section's Won, and the EC's own revenue overlaps it.**
  Studio EC Redirected, EC Direct and Referred are also in the stores' numbers. The hero is B2B's
  influence, measured against a target that `kpi-definitions.md` says counts EC,
  self and referrals. It is not added to company revenue.
- **An empty current month opens on last month (2026-11-01).** At midnight on the 1st
  the whole page read ₹0 and the user took it for broken data. The revenue section and
  Orders each fall back once if the current month has no orders, and revenue says so.
  Picking a period yourself always wins, and a failed read never falls back: it has to
  stay visible as a failure, not pass for an empty month.
- **Filters narrow the cards and table, not the hero.** The hero stays against the
  whole target. A line beside the filters states the filtered share. The branch
  filter is the rep's home branch (the row's `branch`), not where the order was
  booked, so it is labelled "Every branch", not "Every store".
- **Referred reads `GET /b2b/studio-access` `firms[]`, not `/sync/pull-numbers`.**
  A firm's `referrals` are its client numbers, `phones` its own, and `orders` adds any
  number Studio attributed an order to, which covers the linked numbers it does not
  list. An order-only number has no date, so it skips the date gate. `/sync/*` was the
  first choice and Cloudflare answers it 403 from outside a browser, while `/b2b/*`
  passes. b2b-backend #19 added the fields `/sync/pull-numbers` lacked and is now
  unused here. A failed read shows Unknown, never ₹0.
- **A Studio-rejected order still counts here** if Django shows it placed, because
  this reads Django's orders and not Studio's `referral_order`. On 2026-10-31 that
  was one small order. A firm's revenue on its page can differ from this report: that
  page is lifetime plus Studio orders on unlisted numbers.
- **`client_master.referred_clients` is empty and `user_refferred` was not used.** Only
  Studio Space referrals count, so a KAM's referral outside Studio Space is
  invisible. On 2026-10-31 18 referred numbers had one order each.

**Every figure opens down to the enquiry (2026-10-31).** The user: a firm's number
must open to the enquiries behind it, and each enquiry to everything on it. A row in
Firms or People opens `ui/order-drawer.tsx` with every order in that row, and its
header adds up to the row because both read `rollupBy`'s key (`rollupOrders`). A row
in Orders opens that one enquiry. Each enquiry shows why it landed in its channel
(`heldBy`) and `EnquiryDetail`, the Firm page's own card.

**Only the month you picked is ever on screen (2026-11-05).** The user: switching
filters often loaded the wrong data. `useMonthReport` (revenue and the funnel)
keeps only the newest request's answer and shows "…" until the picked month's
report arrives. Before, a slow month that landed after a fast one replaced it
under the new month's name, and its `finally` cleared the loading state early.
Checked on the sandbox with September's read held for 4 s: October stayed on
screen with October's figure. The team, person, branch and search filters were
always in memory and cost no request.

**An order's date on screen is when it was placed (2026-11-05).** The Orders
table's column and the drawer's header read `ticket.placedAt` (`orderPlacedAt`),
as date and time in IST. It was the cart's `createdAt`, labelled "Cart date". The
classifier still gates holders on the cart date (`cartDay` in `classify.ts`),
because a lead or redirect counts only for carts raised on or after it. So
`RevenueOrder.day` is gone, and the month an order lands in is unchanged.

- **No request on click, on purpose.** `/crm/leads/?order_from` already returns the
  ticket, so `classifyOrder` keeps it through `ticketToOrderRow`
  (`lib/b2b/orders/ticket.ts`, split out so the server can import it). A per-phone
  read would be a request for each order of a 40-order person.
- **The cost is report size.** Only classified rows are sent, not the whole month,
  but each now holds its cart and remarks. Not measured on real data: the sandbox
  tickets are tiny. Check the response size on the first signed-in run. If it is
  heavy, drop remarks from the report first.
- **The drawer follows the filters.** It lists what the row counted, so a store
  filter narrows both. It is not a firm's lifetime: that is the Firm page.
- The report now holds client numbers and carts for any `canUseB2B` caller. Those
  callers could already read them on the Firm page.

Real October was read through the compiled classifier in a signed-in production
tab on 2026-10-31 (under the three-channel rules of that day). EC-directed was the largest channel, then Direct, with Referred
very small, and orders booked on B2B still tied to the old hero's total. The figures
stay out of this public repo. Client rows owned by an Inbound person count as KAM,
because they hold the firm. **Not checked:** whether Django
scopes this read for a non-admin token, and `/api/b2b/revenue` itself against real
data. Only the classifier ran on real rows; the route ran on the sandbox and answered
401 without a session. Check the route first once it is deployed or running on :3001.

## A manager credits one order (2026-11-12)

Each order's person comes from `classifyOrder`: the B2B rep on the cart, else the
holder of the number (a firm's current KAM ranks above an Inbound or Outreach lead).
That holder has no date gate for firms, so an order follows whoever holds the firm
today. A B2B manager can now credit any enquiry to anyone on the team, with a
reason, from every enquiry card (Firm page, this drawer, Inbound and Outreach
drawers, the KAM order modal): `order-credit/ui/credit-line.tsx`.

- **Stored in b2b-backend `b2b_order_credit`** (migration 0026), keyed on the
  enquiry id, with every earlier credit kept in `history`. Routes: `GET`/`POST
  /b2b/order-credits`, `DELETE /b2b/order-credits/{enquiry_id}` (Back to the rule).
  The relay lets only a B2B manager write, and stamps `by` with the signed-in
  caller's name, so the browser cannot claim to be someone else.
- **Applied in the browser, not in the report.** `applyCredits(orders, credits)`
  runs over the cached report, so a credit shows the moment it saves and the server
  cache never needs busting. It is idempotent (an order keeps its rule person in
  `rule`), and `OrderDrawer` re-applies it on render, so an open drawer follows a
  credit changed inside it. The channel never changes: a credit moves who, not how
  the order came. The trend's channel totals are therefore unaffected.
- **One read per session** (`OrderCreditsProvider` in the B2B shell, loaded on first
  use). If it fails, the Overview and My performance say the figures follow the rule
  only, and every credit line reads Unknown.
- The Orders table's Credited to column adds "set by a manager" under a credited row.

## Why the revenue sections were slow, and the cache (2026-11-06)

The user found the Overview slow. The :3001 dev log over several days
(`~/Projects/ss-local-stack/logs/crm-3001.log`) had `revenue/trend` averaging
9.1 s (14.4 s on 6 Nov, 114 s worst), one month's `revenue` 1.3 s, and `rows`
about 1 s. Each month's report reads every company order in that month from
Django, 1,000 a page, so six months is six full scans. Two changes:

- **Three months build at once** (`TREND_PARALLEL`), so six months take two rounds,
  not three. More is possible but each month already runs up to 8 page reads.
- **A past month is served from cache and rebuilt in the background.** It is kept
  24 h (`PAST_MONTH_KEEP`). Once it is older than 30 min (`PAST_MONTH_TTL`), the
  next read still answers at once from cache and starts a rebuild. Refresh
  (`fresh=1`) rebuilds unless the copy is under a minute old. The current month
  keeps the 5-minute cache. The cache is per user and per server process, so a
  cold process still pays the full build once.

**Still open:** sharing one report across managers would make a second
manager's load instant. It needs proof that Django's `/crm/leads/` answers the
same rows for callers with the same role and branches. Until then the key
stays per user. A Django endpoint returning only orders on a given set of
numbers would remove the full scans.

## Client Database funnel (2026-11-03)

The user asked for the whole funnel of the Client Database firms, split three ways:
**EC direct** (a store rep on the cart, nobody from B2B on the firm), **EC referred**
(a store rep on the cart, a B2B person on the firm) and **Studio direct** (an Inbound,
Outreach or KAM rep booked it). "Studio" is the user's word for the B2B team here,
not Studio Space. They are the hero's types narrowed to Client Database numbers
(`FUNNEL_OF`): 1–2, 3–4, and 6 and 8. So EC referred follows the hero's
rule exactly, including that a firm's KAM counts for carts raised before the
assignment while a lead counts only from its own date.

- **Only numbers on a `pipeline = 'client'` row are in it** (`clientDbFirms`). A cart
  whose number is also a Studio Space referral counts as Referred in the hero and is
  left out here, with a line saying how many.
- **By cart date, not order date.** Every deal ticket created in the month is read and
  staged by its status now: Carts raised → Quote shared → Ordered → Delivered, with
  Lost beside them (`reachedStage`). So Ordered here is not the hero's set, and the
  hint says so. A June estimate can sit on a ticket raised in October and then
  counts in October.
- **A cart has no ENQ ID until its quote is made.** Django's row `id` is the cart
  number (`CT…`) until then, so In Cart rows show that. Rows are deduped on
  `ticketId`, never `id` (`landmines.md`, a lead's displayed id is not unique).
- **A logged Inbound or Outreach SPoC counts as involvement** from its `from` date
  (`spocHolders` in `book.ts`). This also moves such a firm's orders from type 6
  or 8 to 3 or 4. No firm had one logged on 2026-11-03.
- **Why it waits for a click.** A month is about 10 pages of `/crm/leads/`, far more
  than the order-date read, because most carts never become orders. Loading it on
  every Overview open would spend that on people who never look.
- `Closed, no estimate` (a resolved deal ticket with no estimate) was a guess at
  Django's label when this was checked through Metabase. Whatever Django calls it,
  it counts only under Carts raised unless it is one of the Lost statuses.

Checked 2026-11-03 by running the compiled classifier over Metabase's deal tickets
(the recipe below, with `ticket.extra_data.cart_number` standing in for the id of a
cart without an estimate) and production's `/b2b/*` holders. The route itself has
answered 401 without a session and has not yet run signed in.

## Checking a figure against production (2026-11-01)

The user asked why two totals differ and what sits in each. Reasoning from the rules
gave a bound that later proved wrong, so use real orders, and quote nothing until it
ties out. No real figure goes in this public repo.

1. **Orders:** Metabase `materialdepot_azure` (db 5). `estimate` joined to `ticket` on
   `estimate_id`. Booked on B2B is `estimate.branch_id = 70`. The rep is
   `ticket.owner_id`, not `estimate.assigned_to_id`, which often differs. The enquiry
   id is `estimate.lead_id`. The order date is `coalesce(order_placed_time, created_at)`
   in IST. The cart date is `ticket.created_at`. Value is `total_estimate_amount`.
   `json_agg` into one cell gets past the row cap, and the tool saves it to a file.
2. **Quote Approval Pending:** `order_placed_time` is empty on all of them, and the
   tile counts only those with a ticket. Without the ticket join, the count is about
   five times too high.
3. **Holders:** GET `/b2b/rows`, `/b2b/studio-access`, `/b2b/ec-visits?kind=redirect`
   and `/b2b/team` on production, as `refresh-crm-real.py` does. Local `crm_real` has
   no Studio data, so Referred would read wrong there. Never echo `.env.local`.
4. **Classifier:** compile `classify.ts` and `book.ts` with the `CLAUDE.md` recipe, and
   stub `ticketToOrderRow` in the output. It pulls in `@/` imports and is not needed
   here. Set a row's `branch` to `B2B` when the rep's home branches include it, from
   `user_organisation` to `user_organisation_branch`.
5. **Tie out** count and value per channel, firms per channel, and Won against the
   screen. It matched every card to the rupee on 2026-11-01, so a mismatch means the
   read is wrong.

## Why it was rebuilt

The user found the Dashboard text-heavy and hard to read, with panels left over
from before the Inbound, Outreach and KAM rebuilds. Several figures were also
shown two or three times. Achieved %, run rate and the target each had their own
panel. Revenue split appeared twice from two sources (Django verticals, and typed
Supabase values). "Pipeline by Stage" added New, In Progress, PI and Won across
three teams that do not share stages.

## The sections, top to bottom

1. **B2B revenue, four channels.** See the section above. The hero is the sum of
   Direct, Studio EC Redirected, EC Direct and Referred against `b2bTargetL`, with
   a pace marker on the current month. Direct and Studio EC Redirected show their
   types as bars, and a bar filters the table to that type. Referred shows where
   its orders were booked. Under the cards, **Month by month** stacks the channels
   for the last six months; a bar opens that month. Its two months at a time keep
   Django to 16 page reads in flight, and a month the hero is already building is
   shared, not built twice (`revenueReport`'s single-flight). EC Direct is cyan
   (`#0891B2`), which passed the palette validator against all three other
   channel colours; purple failed against Direct's indigo.
2. **Client Database funnel**, below.
3. **Inbound → Outreach → KAM.** One card per team: live pipeline (deal-ticket
   value at Quote or PI shared), a stage funnel, and one rate. Inbound and
   Outreach show "Converted" (Closed over every stage except Invalid). **KAM
   shows its win rate instead,** because `kamFunnel` steps are cumulative
   ("standing here or beyond"), so Closed over their sum would be wrong. Each
   card's Open link switches the B2B sub-tab (`onNavigate`).
4. **Client book · Needs attention.** The 30/60-day status as one stacked bar,
   new clients by month (the last 6), and one attention list with two tabs:
   Going inactive (`k.atRisk`) and Escalations (`health.attention`). Each shows
   6 rows and links to Client Database.
5. **KAM desk.** `kamAccountSplit` and `callCompliance` merged into one row per
   KAM (`kamDeskRows`): firms, active, open orders, pipeline, revenue, calls
   today and overdue follow-ups.

Explanations moved off the page into the ⓘ tooltips (`Hint`). Notices stay as
amber lines, because a failed read must never pass for a zero.

**Dropped on purpose; don't re-add them as panels:** Orders on the B2B branch (its period and basis toggles, status tiles and Open carts drawer) and the "How this ties to Orders on the B2B branch" table, both removed by the user on 2026-11-03, Where It Came From (the Django vertical donut, replaced by the channels), Target
Achieved and Run Rate (now in the hero), Pipeline by Stage, Pipeline by Vertical, the KAM §6
pipeline tiles, Target vs Revenue and Total Revenue Split. The last two used the
typed Supabase values, a third revenue number that agrees with neither Django
figure (`data-layer.md` §Targets is still a third number). Also dropped: the
cohort table (now a chart) and Account Temperature with its mismatch list.

Channel colours are indigo, magenta and lime (`#4F46E5`, `#DB2777`, `#65A30D`),
kept apart from the team hues and passing the same validator.

Team colours (Inbound blue, Outreach amber, KAM teal, plus purple as a 4th
vertical) were checked with the dataviz palette validator: lightness, chroma,
CVD separation and contrast all pass. The old `#1A1A1A` / `#EAB308` set failed
three of those checks.

Checked 2026-10-30 in `npm run dev:sandbox` as Meera (manager): every section
rendered with no page errors, and only GETs were sent. Django, the B2B backend
and Kylas were stubbed there; Supabase was real.
