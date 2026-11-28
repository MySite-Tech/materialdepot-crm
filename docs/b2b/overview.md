*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Overview (was "Dashboard", rebuilt 2026-10-30)

**Covers:** `components/b2b/views/overview/**`

## Data

Unchanged from the Dashboard it replaced. The load rules (split by dependency,
date and branch basis, `basisApplied`) are in `data-layer.md`.

| Call | Endpoint | When |
|---|---|---|
| `fetchB2BData`, `fetchTargets` | B2B backend, through the 8 s B2B cache | On open (`readInputs`) |
| `fetchB2BBulk`, `resolveKamOrders` | Django `/crm/leads/b2b-bulk/`; a KAM order the bulk read does not match falls back to one `/crm/leads/?enquiry_ids=` and per-number `q=` reads (`lookupEnqId`, at most 60 orders) | On open. The page paints from the bulk match and runs the fallback after (below) |
| `fetchRevenueReport` | `GET /api/b2b/revenue?from&to` | One per month picked; on Revenue analysis, one per month of the last six plus any month picked there. Server cache per caller, 5 minutes for the current month and 30 for past ones. Refresh bypasses it, for that read only: a month picked after Refresh uses the cache (before 2026-11-05 every later pick bypassed it, about 4 s each). Carries each order's whole ticket, so the drill-down below costs no request. Classifying needs every B2B person's order since April 2026, read once per caller and cached (§A firm's B2B tie-up has a start date) |
| `fetchRevenueTrend` | `GET /api/b2b/revenue/trend` | On open. The last six months' channel totals, built from the same per-month reports and cache, three months at a time (two until 2026-11-06). No orders in the response |
| `fetchEnquiryItems` | Django `/crm/leads/?enquiry_ids&include=boq` | Only when one enquiry is expanded, once per enquiry (`client-db.md` §One enquiry) |
| `fetchClientFlow` | `GET /api/b2b/revenue/clients` | Only on the Clients sub-tab. One month digest per month since April 2026 (built with, and cached beside, each month's revenue report) plus `client-order-history` for first-order dates, 280 numbers a call. The whole answer is cached 5 minutes per caller; Refresh rebuilds only the current month |
| `fetchFunnelReport` | `GET /api/b2b/revenue/funnel?from&to` | Only once the Client Database funnel is opened (remembered per browser), then one per month picked; 5-minute server cache per caller. Reads `/crm/leads/?created_from&created_to` for the month, up to 30 pages of 1,000, 8 at a time |

## Revenue analysis sub-tab (2026-11-27)

The user: the Overview tells what revenue was, not why. They asked for a sub-tab to
slice it by every parameter it can be attributed to (branch, BM, category and the
rest), compare two months, and see what went right in a strong month and wrong in
a weak one. Overview now has two sub-tabs, **Overview** (everything below) and
**Revenue analysis** (`views/overview/analysis/`). The Overview card's "Analyse
revenue" link opens it.

**Opened signed in on production on 2026-11-27:** the headline (revenue, orders, firms
ordering, average order) against October 1–27, the split into fewer vs smaller orders,
What moved it per dimension and the six-month channel table all loaded, with no console
errors. A second signed-in check the same day tied it out: the Revenue tile equalled
the hero, the channels and order counts matched the hero's cards, the six reads all
answered 200 from the server cache, and Analyse revenue, the drill from Channel to Branch
and the Same days toggle worked.

- **It reads only `fetchRevenueReport`, one per month,** the same per-order report
  and server cache as the hero. Six months (the trend's window) plus any older
  month picked, three at a time (`LOAD_PARALLEL`), so opening it costs 6 requests.
  The Overview's own reads (`useOverviewData`, the trend, the funnel) do not run
  on this sub-tab. A real month was a few hundred KB in November 2026, so six
  months hold a couple of MB. If that is too heavy, drop remarks from the report first.
- **Everything else is in memory** (`analysis/utils.ts`, no React, runnable with
  the compile recipe in `CLAUDE.md`). Ten dimensions, each one function of an
  order (`valuesOf`): channel, branch, rep on the cart, category, how B2B holds it
  (the order type, with 4 split by `heldBy`), B2B team, credited to, client type,
  order size and firm. Each filters, breaks down, and shows in What moved it.
- **Branch is the cart rep's home branch, not where it was booked,** the same as
  the Overview's branch filter. Django does not fill `bookedBranch` yet
  (`backends.md` §Owed by Django row 10). For a store order the two agree.
- **Category is the cart's category names.** `/crm/leads/` sends one string per
  order ("Laminates, Tiles"), with no price per category, so a two-category order
  counts in full under each and categories add up to more than the total. The
  hint says so. A per-category value
  split needs Django to send line totals by category.
- **Client type is mostly blank** on real tickets (about two in three in October
  2026). It shows as "Not recorded", never dropped.
- **Rep on the cart is the "BM" for a store order.** It is `placedBy`, Django's
  ticket owner. "Credited to" is the B2B person, after `teammateRecordOwner` and
  any manager credit (`applyCredits`).
- **Same days only** (on by default when the current month is one of the two):
  both months are cut to days 1–N by IST placed date, so 27 days are not compared
  with 31. The month-by-month table is always whole months.
- **The revenue change splits exactly into volume and order size:**
  `(orders now − orders before) × avg before` plus `orders now × (avg now − avg before)`.
- **Clicking a name drills in.** It filters to that value and moves Break down by
  to the next unfiltered dimension, so Channel → Branch → Rep → Category is one
  click each. The filter lists are faceted: each lists only values left under the
  other filters.

Checked 2026-11-27 by running the compiled `utils.ts` in a signed-in production tab
over real reports: November (1–27) equalled the hero's figure exactly, and so did
October against the trend. The figures stay out of this public repo. The volume/size split, the per-channel changes and the
per-branch rows each added back to the totals exactly. The screens were driven on
the sandbox only (`npm run dev:sandbox`, Django and the B2B backend stubbed), with
no console errors. **After deploy,** open it signed in as a manager and check that
the Revenue tile for the current month equals the Overview hero.

## Clients sub-tab: new, revived, moved and churned (2026-11-28)

The user wants to see firms move: new firms arrive as leads or Client Database firms,
Client Database firms move to Outreach and then to a KAM. The Clients sub-tab
(`views/overview/clients/`, logic in `lib/b2b/revenue/clients/`) shows, for the last
five months, how many clients ordered and where each came from. The user's
definitions, 2026-11-28:

- **A client** is a firm across all its numbers: every record sharing a number
  (`firmGroups`, since 2026-11-28; before, Client Database rows only), otherwise one
  phone number. **Studio** that month means at least one Direct, Studio
  EC Redirected or Referred order; **EC** means EC Direct only.
- **New:** no order with Material Depot, on any branch, in the 12 months before,
  which includes a first-ever order. **Revived:** an order after 3 or more empty
  months, with one inside the 12. **Churned in M:** last order in M-3 and nothing in
  M-2, M-1 or M (for the current month, so far). New wins over revived.
- **Moves** compare with the client's last ordering month in the 3 before: Studio →
  Studio, EC → Studio, EC → EC, Studio → EC, and Store buyer → B2B (ordered then, but
  not as a B2B client, for example before becoming a lead).
- **Django's order read starts in April 2026** (`ORDER_HISTORY_FROM`):
  `/crm/leads/?order_from` returns 0–2 placed orders a month before that, and the
  `created_from` read nothing at all (checked 2026-11-28). So "every number that ordered
  that month" (`MonthDigest.buyers`, all placed orders, not only B2B ones) exists only
  from April. Earlier history comes from `client-order-history`'s lifetime
  `firstOrderDate`, which reaches 2024. A client not seen since April whose first
  order is inside the 12-month lookback is Revived. One whose first order is older (or
  whose first-order date did not load) could be revived or new, and Django cannot say.
  **Since 2026-11-28 it counts as Revived with `gapUnknown`** (the user's choice: a
  returning customer with an unknown gap), shown as "incl. n gap unknown" under the
  Revived figure and "gap unknown" in its list. It was its own row, "Earlier client,
  gap unknown", until then (23 clients in July 2026, 3 in November). The flag empties by
  April 2027. Making it exact needs Django (`backends.md` §Owed by Django row 23).
- **Churned's amount is what those clients spent in their last month** (M-3), the
  monthly spend lost, never revenue in M. The cell reads "₹x spent in Aug" and the list
  column "Spent in their last month", because the bare figure read as November revenue
  (2026-11-28).
- **Not registered yet** (group "Outside the B2B book", 2026-11-28, the user's ask).
  Firms billed with a GSTIN on an order that month that no B2B board holds and nobody
  marked Not a client: Client Database → Review new firms, split by month. It reads
  `fetchReviewQueue` (`/api/b2b/client-import`, B2B managers only, server cache 30
  minutes, about 16 s cold) once, beside the flow read, so the tab costs two requests;
  each `ReviewFirm` now carries `months` (orders and value per IST month). A firm with
  any number among that month's B2B buyers (`FlowMonth.phones`) is left out, because
  Review new firms checks only Client Database, Inbound and Outreach rows and revenue
  also counts Studio Space, redirects and referrals: on production 3–19 firms a month
  overlapped. It is outside Clients ordering and All B2B. Working the review list moves
  a firm out of this row and brings its orders, past months included, into All B2B (as
  EC Direct before its tie-up). On 2026-11-28 production showed this row larger than
  All B2B from August to November; proprietors are individual GSTINs and include
  store walk-ins asking for a GST bill, which is why it is split. The read failing
  shows Unknown, never 0.
- **Cost.** Each month's build now also returns a digest (every buyer's number, and
  each B2B order's phone, channel and value), cached beside the report under
  `b2b-digest:`, so a lookback month does not keep its full report in memory. The
  report and the digest share one in-flight build. Opening the tab is seven requests
  (the flow, Review new firms, and five monthly revenue reports for the journey below);
  the server reads the months it has not cached (about four Django pages each) and
  `client-order-history` in batches of 280.
- **Checked on production data on 2026-11-28** in a signed-in tab, through the bundled
  module: each month's clients add up to the month's All B2B and Studio Sales totals
  exactly, and the rows add up to Clients ordering. November's EC → Studio is almost
  all firms given a KAM on 9 and 17 Nov, ordering at stores under that KAM. After
  deploy (PR #106) the live route returned the same figures month by month. Its first
  cold call got a Django 500 on one month's page read and Retry worked in 4 s (the other
  months were cached); a 5xx page is now retried once (2026-11-28). The screen itself
  ran on the sandbox only.

### Firm journey: why revenue moved between two months (2026-11-28)

The user wanted to see where July's revenue went by November: which firms stopped, which
ordered less, which moved from EC Direct to Studio, who joined and from where, with
average order, categories, churn and retention. The Clients sub-tab now opens on this
analysis (`views/overview/clients/journey/`, logic in `lib/b2b/revenue/journey/`), with
the month-to-month table (`clients/movement/`) below it.

- **Two lenses.** Studio Sales counts only a firm's Direct, Studio EC Redirected and
  Referred orders, so an EC Direct firm is the pool Studio grows from, worth ₹0 until it
  moves. All B2B counts every channel. Same rules as the hero.
- **It reads the per-order revenue reports** (`fetchRevenueReport`, one per month, the
  same server cache as Revenue analysis) for the five flow months, through
  `overview/hooks/use-month-reports.ts`, now shared by both sub-tabs. Everything else is
  in memory. Any month failing shows a notice and no journey, never a partial bridge.
- **A firm is `RevenueOrder.clientKey`** (added 2026-11-28): the same firm-group key as the
  Clients flow (`firmKey`), so the journey and the month-to-month table agree on who a
  client is. `ecReferral` (also new) marks orders on a number an Outreach lead holds with
  source EC B2B Referral or EC referral.
- **Every firm gets one path between month A and month B.** Studio in A: stayed Studio,
  Studio → EC, or stopped. EC in A: EC → Studio, stayed EC, or stopped. Not in A: its first
  ordering month after A decides, through the Clients flow's lifecycle for that month:
  new, revived, store buyer → B2B, or skipped A (ordered in the months just before A).
- **The bridge adds up exactly:** A's revenue + each path's change = B's revenue
  (stayed paths split into ordering more and ordering less). Checked on production
  reports on 2026-11-28 through a bundled copy of the module: the tie-out was ₹0.00 under
  both lenses. Every bridge step, flow band, category and journey chip filters the firm
  table.
- **Where new revenue came from** is each joining firm's largest source of B orders
  (`orderSource`): EC B2B referral, Referred client, the holder (KAM firm, Inbound lead,
  Outreach lead, Studio Space firm, logged redirect), else the B2B team on the cart.
- **Every tile goes somewhere (2026-11-28, the user's ask).** Revenue scrolls to the
  bridge and Average order to Month by month. Firms ordering, Retention, Churned and
  Joined since filter the firm table to exactly the firms they count and scroll to it;
  a second click clears it. Each count and its list read the same predicate
  (`FIRM_SETS` in `journey/utils.ts`), so a tile and its list cannot drift. Churned and
  Retention count a firm by orders, the same as the retention grid, not by value.
- **Layout (2026-11-28).** Month by month sits beside Retention (both run across the five
  months), and new-revenue sources beside categories, so paired cards are of similar
  height. The bridge has dashed connectors and room above its tallest bar for the label
  (`docs/landmines.md`).
- **Retention** is the share of a month's firms (for the lens) ordering in each later
  month, by firms or by revenue. Churn on the tiles is 1 − retention from A to B. This
  is month-to-month, not the 3-empty-month churn of the table below.
- **Same days only** (on by default when B is the current month) trims every month to
  days 1–today, so a part month is never compared with full ones.
- **Categories** count an order in full under each of its categories, as in Revenue
  analysis (`orderCategories`, now shared).
- Seen on the sandbox, on production reports through the bundled module, and **signed in
  on production after deploy (PR #125, `5f56129`)**: every section loads with no page errors.

## Four revenue channels (redefined 2026-11-03, Direct narrowed 2026-11-28)

Every placed order gets a **type** (the numbering in the user's "B2B Sales Data"
sheet), and the type decides the channel (`lib/b2b/revenue/utils/classify.ts`):

| Type | Who and what | Channel |
|---|---|---|
| 1 | Someone on the B2B team that day, booked on the B2B branch | **Direct** |
| 2 | Someone on the B2B team that day, booked at a store | **Studio EC Redirected** |
| 4 | A store rep, wherever booked, for a firm whose B2B tie-up had started that day | **Studio EC Redirected** |
| 5 | A referred client's number | **Referred** |
| 8 | A store rep, wherever booked, for a firm B2B knows (Client Database, KAM row or Studio Space), before its tie-up started | **EC Direct** |
| — | A store rep, on a number no B2B record holds | not B2B revenue |

- **Direct is a B2B person's order on the B2B branch, not everything on branch 70
  (2026-11-28, the user's choice).** Store reps book on the B2B branch all the time
  (JP Nagar, HQ, Gachibowli and others, dozens of people who were never on B2B), and
  until this date those orders were types 3, 6 and 7, all Direct. The user wants the
  channel to follow who did the work, so those types are gone: a store rep's order on
  the B2B branch is a store order (4, 8 or nothing). The trigger was the user's own
  example: Mandeep left B2B on 24 Sep and works at Electronic City, but Django still
  books his estimates on branch 70, so a client B2B sent to him read Direct instead of
  Studio EC Redirected. **Direct no longer equals branch 70 in Metabase**; the 3 Nov
  tie-out below was under the old rule. Run on real July–November orders the same day,
  July's Direct came out equal to the old "B2B rep on cart" line exactly, and Studio
  Sales fell in every month, most in July and August. Individual credit does not move:
  a store rep's order on a held number still goes to the record's owner.
- **Studio Sales and All B2B (2026-11-28).** Studio Sales is Direct + Studio EC
  Redirected + Referred, the B2B team's effort, and is what the target measures. All
  B2B revenue adds EC Direct, firms ordering at a store on their own. The hero shows
  Studio Sales against the target with All B2B under it; Month by month has a Studio
  Sales / All B2B switch (below); Revenue analysis opens scoped to Studio
  Sales (a switch sets the Channel filter). One function each: `studioTotal`,
  `isStudioChannel`, `STUDIO_CHANNELS`.
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
- **HQ is a store too.** A walk-in at HQ on no B2B record is retail. HQ kept booking
  110–150 store orders a month after July with almost no B2B rep.
- **Referred is every order of a referred client, wherever it was booked.** The user
  first listed type 5 under Direct, then asked to see referred clients' orders
  entirely separately. The Referred card splits its total by booking place, and the
  Direct card says how much referred revenue sat on the branch, so the Metabase
  figure can still be rebuilt from the screen.
- **Type 8 is the Client Database's firms with no KAM**, including the
  client_master import. Many of those designers bought at stores before anyone at
  B2B knew them, and the user wants that volume visible as EC Direct. A firm is
  matched by any of its numbers, and its orders count as EC Direct up to the day its
  B2B tie-up starts (§A firm's B2B tie-up has a start date).
  An order placed under a number the firm record does not hold (a site supervisor,
  the end client) is missed: there is no GST or name match.
- **A KAM holds a firm from its first KAM assignment, not for its whole history
  (2026-11-27).** A Client Database firm with a KAM is type 4 only for orders
  placed (`orderPlacedAt`, else the cart date) at or after its earliest assignment
  that was not Rejected (`kamSince`, from `meta.assignments[].at`). Earlier orders
  stay type 8 with nobody credited, which is the 2026-10-30 rule that revenue follows
  the owner at close. Before this, the check was "has a KAM today". About 400 firms
  got their first KAM on 9 and 17–18 Nov, so every past store order of theirs moved
  from EC Direct to Studio EC Redirected, and EC Direct read zero in every month on
  the Overview and Revenue analysis while the totals stayed right. A firm with a KAM
  but no dated assignment keeps its whole history as before. An Inbound or Outreach
  SPoC, a redirect or a Studio Space number still makes the order type 4 by its own
  date. This also takes KAM credit off orders placed before the KAM held the firm;
  a manager can still credit one order by hand (§A manager credits one order). The
  date gate lives in `asOfOrder` (`classify.ts`) and was checked on hand-built cases
  through the compiled classifier. **After it deploys,** every month's total and
  order count must be unchanged and EC Direct must read above zero.
- **A rep's team is the one they held on the order's day (2026-11-27).** Team rows carry
  `joined_on`/`left_on` (b2b-backend 0034, set on the Team tab), and `repOf(name, reps,
  day)` returns only the teams whose dates cover the order's IST day (`orderPlacedAt`,
  else the cart date). A person with any dated row is judged by their dates alone: their
  undated inactive rows, the static roster and `branch === 'B2B'` no longer make them a
  B2B rep. A person with no dates keeps the old rule (active rows, roster, branch), so
  nothing changes until they are dated. An order by someone on B2B that day reads
  `store: B2B`, because the row's `branch` is the rep's home branch **today**: a KAM who
  became a store manager had every past order filed under the new store
  (`docs/landmines.md`). After their last day their orders are store orders like anyone's.
- **A person who moved to a store counts as booked on B2B for every day they were on
  B2B (2026-11-28, the user's call).** Django also re-files the *booking* of a mover's
  old orders: a KAM whose last B2B day was 24 Nov (now at Indiranagar) had a June month's
  orders read as booked at a store, and an Inbound rep who left on 24 Sep (now at
  Electronic City) had three July orders the same way, so they read Studio EC Redirected
  (type 2). The user: they booked those on B2B. So for a **dated** person on B2B that day
  whose Django branch today is not B2B (`movedToStore` in `classify.ts`), the order is
  type 1, Direct. It reads their Team-tab dates, so a future mover needs only a last day
  on the Team tab. Someone whose Django branch is still B2B keeps a genuine store booking
  as type 2. Only the Direct/Redirected split moves: Studio Sales, All B2B, credit,
  Clients and the funnel are unchanged (checked on production orders that day: two
  months changed, everything else identical). Live as CRM #122 the same day and
  rechecked signed in after deploy: the live reports matched that prediction exactly.
- **The first match decides the type:** referred, then a B2B rep, then a holder on the
  order's day, then an earlier B2B order for the firm, then a known firm (EC Direct).
- **The funnel keeps its cut** through `FUNNEL_OF` on the type: Studio direct is
  1–2, EC referred 4, EC direct 8.
- **`branch=HQ` on `/crm/leads/` has not been seen answering from real Django.**
  `branch=B2B` matches `organisation_branch.branch_name`, and HQ's name is `HQ`, but
  the first signed-in run over a June month should confirm Direct is not ₹0.

Checked 2026-11-03 by running the compiled classifier over every placed order from
June to 3 November (Metabase) against production's `/b2b/*` holders. Under that
day's rule Direct plus referred-on-branch equalled branch 70 in count and value every
month. Since 2026-11-28 it does not, by design: store reps' branch-70 orders left
Direct (above). The figures stay out of this public repo.

- **The only bulk read of orders is `/crm/leads/?order_from&order_to&branch_basis=estimate&page_size=1000`.**
  It takes `page_size=1000`, unlike what `backends.md` row 8 assumed. October was
  3,855 rows in 4 pages, about 4 s with the `branch=B2B` read beside it. The row's
  `branch` is the rep's home branch, not the booking branch, so the second read
  marks `bookedOnB2B`. It runs in a route handler because it is 5+ requests.
- **A B2B rep is `row.branch === 'B2B'`, or an exact full-name match on the team or
  roster. Never `sameRep`.** Its prefix match made a team member equal to a store
  rep with the same first name and moved that rep's whole month into Direct. The
  two have different phones in `users_user`.
- **The cart's rep is matched to the team by sign-in number too (2026-11-14).** Order
  rows carry only Django's name for the rep. Krishna Jadhav's login is named "none"
  (`backends.md` §Owed by Django row 15), so his own carts read person "none", matched
  nobody, and his My performance read ₹0. `readHolders` now also reads Django's staff
  list (`staffDirectory`, `/user-organisation/`, cached 10 minutes for everyone). A
  Django name whose login number is an active team member's becomes an alias for that
  member, with a doubled surname too (row 11). A name two logins share ("null") is
  never aliased. `placedBy` and `person` both carry the team name. The list is the same
  call `requireCaller` makes, and a failed read falls back to names only.
- **A lead or redirect counts only for carts raised on or after its date,** so a
  store customer who later became a lead is not claimed. Firms are dated too since
  2026-11-28.
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
  list. An order-only number takes its firm's Studio Space date. `/sync/*` was the
  first choice and Cloudflare answers it 403 from outside a browser, while `/b2b/*`
  passes. b2b-backend #19 added the fields `/sync/pull-numbers` lacked and is now
  unused here. A failed read shows Unknown, never ₹0.
- **A Studio-rejected order still counts here** if Django shows it placed, because
  this reads Django's orders and not Studio's `referral_order`. On 2026-10-31 that
  was one small order. A firm's revenue on its page can differ from this report: that
  page is lifetime plus Studio orders on unlisted numbers.
- **Referred also counts referrals made in the CRM (2026-11-27).** Any Inbound lead,
  Outreach lead or firm can refer clients from its drawer (`studio-space.md` §Two-way
  sync). Each becomes a `referred` holder on that number from the referral's date,
  credited to the referring record's owner **on that record's team** (Inbound, Outreach
  or KAM), so the Referred card is no longer KAM-only (`classifyOrder` uses the holder's
  team). Studio referrals now count when `approved`, `active` or `dormant`; before,
  only `approved` counted, so a referral Studio had moved to active silently stopped.
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

## A firm's B2B tie-up has a start date (2026-11-28)

The user, 28 Nov: what a firm is today must not decide its July orders. Their two cases:
a Studio Space firm whose orders B2B people were booking in June, so its later store
orders are B2B work, and a firm that bought only at one store until Outreach brought it
in at the end of October, so its earlier orders are EC Direct. Before this, both read
Studio EC Redirected from June because the firm is on Studio Space now.

- **A firm is every record that shares a number** (`firmGroups` in `book.ts`): Client
  Database rows, old KAM-tab rows, Studio Space firms, Inbound and Outreach leads. Each
  record's holder is put on every number of its firm (`holdFirm`), so an order on any
  of a firm's numbers sees the whole firm. On production on 28 Nov the largest firm had
  17 numbers and no team member's number sat on any record, so nothing over-merged.
- **The tie-up starts on the earliest of:** a B2B person's order on any of its numbers
  (`buildTouches`, every placed order since April 2026 whose rep was on B2B that day),
  its first KAM assignment (`kamSince`), an old KAM-tab row's `created_at`, an Inbound or
  Outreach lead or SPoC, a logged redirect, or its Studio Space `onboarded_on` (from
  `/studio-access`, b2b-backend PR `studio-access-onboarded-on`).
- **Before it, a store rep's order is EC Direct** if the firm holds a firm record
  (Client Database, KAM row or Studio Space, `groups.known`), and not B2B otherwise.
  **From it, Studio EC Redirected.** A B2B person's own order is Direct or type 2, as before.
- **The tie-up never lapses (the user's call).** A firm that stops ordering for three
  months is churned on the Clients sub-tab; its channel does not go back to EC Direct.
  So Clients' Studio → EC row is empty by design.
- **Credit follows the order's day.** A Studio firm's KAM is credited only from that KAM's
  first assignment; before that the Studio number counts as Redirected with nobody, and
  until 28 Nov it carried today's KAM on every past order. When the only evidence is an
  earlier B2B order, the person who took the latest one is credited if they were still on
  B2B on this order's day, otherwise nobody. Individual figures moved accordingly: KAMs
  lost store orders placed before they held a firm, and the people who had booked those
  firms' orders gained them.
- **Limits the user accepted:** Django's orders start in April 2026, so a tie-up seen only
  in older orders is missed. `onboarded_on` defaults to the day a partner row was
  inserted, so a backfilled firm may carry that day. **Until the backend PR deploys,
  `onboarded_on` is absent and a Studio number counts from the start, as before;** deploy
  the backend first.
- **Cost.** Classifying any month needs every B2B person's order since April. Each
  month's placed orders are read once per caller and cached (`b2b-raw:`, past months
  24 hours), and the B2B-order index is cached 5 minutes (`b2b-touches:`). A cold first
  load reads about eight months before its headline; after that, past months come from
  cache. A Django 5xx on a page is retried once (`ordersPage`).
- **Checked on production orders on 28 Nov** in a signed-in tab through the compiled
  bundle, against the live route: Direct identical in every month; totals up by under 2%
  (single numbers a B2B person had sold to, whose later store orders now count); earlier
  B2B orders moved a share of EC Direct to Redirected in every month from June to
  October; dating Studio moves the other way by an amount that depends on the real
  onboarding dates, bounded on both sides with Studio counted from June and not at all.
  Figures are in memory, not here.
- **Live since 2026-11-28 (backend #46, CRM #119), checked signed in on production.** Every
  Studio Space firm's `onboarded_on` falls in September to November, so June to August
  count no Studio evidence at all. The live month reports equalled the pre-deploy run;
  Direct was unchanged in every month; a store-only firm onboarded in mid-October read EC
  Direct before that day and Redirected after; trend, Clients (Studio → EC zero every
  month), funnel and EC SPoCs answered 200, and no B2B Sales tab logged a console error.

## A teammate's ticket does not take the lead owner's order (2026-11-17)

The user, twice (14 and 17 Nov): orders on Vikas's Inbound leads did not count under
him. Hardi Patel opens the Django deal ticket for Inbound clients during working
hours, so she is `ticket.owner_id` (the cart's rep) on orders Vikas closed. The rule
put "a B2B rep on the cart" first, so each order was Hardi's. That contradicted the
user's 2026-10-30 rule that revenue goes to whoever owns the record at close.

`teammateLeadOwner` (`classify.ts`): when the cart's rep is a B2B rep, and an Inbound
or Outreach lead on the number (from before the cart) is owned by someone else on a
team the cart rep is on, the order is that lead owner's. The channel and type do not
change. The cart rep keeps it when they own a lead on the number themselves, or no
teammate does. Run on every November order booked on the B2B branch (1–17 Nov, real
holders, compiled classifier), exactly six orders moved, all from Hardi to Vikas.
Manual credits still win over the rule.

**KAM firms too, but only the KAM at order time (2026-11-18, the user's choice).**
Asked who gets a KAM firm's order when another KAM opened the deal ticket, the user
picked the firm's KAM, but only if they held the firm when the order was placed, so
a later reassignment never moves past orders. `teammateRecordOwner` takes firms as
well as leads; a firm counts when its `kamFrom` (the start of the current KAM's
unbroken run of `assignments` entries, Rejected skipped, built in `book.ts`) is at or
before `orderPlacedAt` (else the cart date). A firm with no assignment entry naming
its KAM has no known start and counts as held: those are KAM-sheet and import firms
whose KAM predates the assignment log. Still team-matched: a cart opened by someone
on another team (Vilok, Outreach, on Prafful's firm) stays with that person, which
the user was not asked about. Store-rep carts are untouched: they already went to
the firm's KAM with no date gate (type 4). On the same November orders: four moved
to Krishna (on Sidhant's and Tharun's tickets), and three stayed with the
ticket owner because the firm reached its KAM after the order (varun on 9 and 17 Nov,
Krishna at 13:20 on 17 Nov against a 06:49 order).

## A manager credits one order (2026-11-12)

Each order's person comes from `classifyOrder`: the B2B rep on the cart (unless a
teammate owns the Inbound or Outreach lead, above), else the
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

**The Overview paints before the KAM order lookups (2026-11-27).** The user found the
Overview took about a minute on a cold load. The time was not the revenue report: on
production about 10 KAM orders' Enquiry IDs miss `b2b-bulk`'s deals, and
`resolveKamOrders` then looks each one up (`/crm/leads/?enquiry_ids=`, then a `q=`
search per firm number, 15 Django calls of 2–15 s), and `readBase` awaited all of it
before anything rendered. Now `useOverviewData` resolves from the bulk match only
(`resolveKamOrders(…, lookup = false)`), paints, and runs the per-order fallback in the
background, then repaints. Until it finishes, an order it is still checking shows at
its logged value. (The KAM desk's "has not matched a deal ticket" note that waited on
it went with the KAM desk on 2026-11-28.) The
request count is unchanged; only the wait moved. Checked on the sandbox with the bulk
deals stripped and each lookup delayed 8 s: the page painted at 5 s and the KAM
revenue filled in when the lookups landed. A Refresh mid-lookup drops the older run's
result (`run` ref). The lasting fix is fewer misses: those orders' Enquiry IDs should
match a ticket on the firm's numbers.

On production after that change, a warm load painted at about 8 s, all of it waiting on
`/api/b2b/rows` then `b2b-bulk`, and the revenue headline, whose own read answers in
under half a second from the server cache, only started then because it rendered
behind the same gate. So the revenue section and the client funnel now render at once,
outside the `base` gate, in a tree whose shape never changes (so they never remount and
fetch twice). The target, the pace figures and the rest of the page fill in when the B2B
reads land; until then the target reads "—". Checked on the sandbox with rows and
`b2b-bulk` delayed 6 s each: the headline showed at 4 s, the target at 14 s, and the
revenue read ran once.

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
  (`spocHolders` in `book.ts`). This also moves such a firm's orders from type 8
  to 4. No firm had one logged on 2026-11-03.
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
   for the last six months; a bar opens that month. **A Studio Sales / All B2B switch
   picks what the bars measure (2026-11-28).** Each bar's height, label and stack are
   the same figure: Studio Sales stacks its three channels, All B2B all four. Before,
   the label was Studio Sales while the height was All B2B with EC Direct faded on
   top, so a month with the larger label could draw the shorter bar (it had less EC
   Direct). Don't put two measures on one bar again. Its two months at a time keep
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
4. **Client book · Needs attention.** The calendar-month status (`kam.md` §Account
   status) as one stacked bar. Each firm's metrics are Client Database's: b2b-bulk
   plus its Studio Space orders (`withStudioOrders`, from `fetchStudioAccess`, read in
   parallel with the base data and shared through its 60 s cache). Until 2026-11-27 the
   Overview skipped the Studio orders and read 190 Active against Client Database's 194
   (`docs/landmines.md`). A failed Studio read falls back to b2b-bulk alone, as Client
   Database does. Then
   new clients by month (the last 6), and one attention list with two tabs:
   Going inactive (`k.atRisk`) and Escalations (`health.attention`). Each shows
   6 rows and links to Client Database.

Explanations moved off the page into the ⓘ tooltips (`Hint`). Notices stay as
amber lines, because a failed read must never pass for a zero.

**Dropped on purpose; don't re-add them as panels:** the KAM desk (one row per KAM: firms, active, open orders, pipeline, revenue, calls today, overdue; removed by the user on 2026-11-28), Orders on the B2B branch (its period and basis toggles, status tiles and Open carts drawer) and the "How this ties to Orders on the B2B branch" table, both removed by the user on 2026-11-03, Where It Came From (the Django vertical donut, replaced by the channels), Target
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
