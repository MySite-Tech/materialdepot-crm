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
| `fetchVerticalStats` (1–2 calls) | Django `/crm/leads/stats/` | Orders section: on open and on each period or basis change (`readRange`) |
| `fetchRevenueReport` | `GET /api/b2b/revenue?from&to` | One per month picked; 5-minute server cache per caller. Refresh bypasses it |
| `fetchCRMLeads` | Django `/crm/leads/` | Only when Open carts is clicked |

## Three revenue channels (2026-10-31)

The user's definition: B2B moves revenue directly, by sending a client to an EC,
or through clients a partner firm refers. Direct and EC-directed each split into
KAM and Inbound · Outreach. Referred is always KAM.

**The first match wins, per order** (`lib/b2b/revenue/utils/classify.ts`):

1. **Referred.** The number is a Studio Space `referral` with `source = client`.
2. **Direct.** A B2B rep holds the cart, whichever branch booked it.
3. **EC-directed.** A store rep holds the cart, and the number is held by a firm
   with a KAM, a Studio Space firm's own numbers, an Outreach or Inbound lead, or
   a logged redirect.
4. **Not counted, No KAM yet.** The number is only on a firm with no owner.
5. **Not counted, Not traced.** Booked on the B2B branch, on no B2B record.

Anything else is ordinary retail and is dropped. Bucket 4 and 5 are shown under
the cards and open as lenses, so the Client Database's unassigned firms show what
they are worth.

- **The only bulk read of orders is `/crm/leads/?order_from&order_to&branch_basis=estimate&page_size=1000`.**
  It takes `page_size=1000`, unlike what `backends.md` row 8 assumed. October was
  3,855 rows in 4 pages, about 4 s with the `branch=B2B` read beside it. The row's
  `branch` is the rep's home branch, not the booking branch, so the second read
  marks `bookedOnB2B`. It runs in a route handler because it is 5+ requests.
- **A B2B rep is `row.branch === 'B2B'`, or an exact full-name match on the team or
  roster. Never `sameRep`.** Its prefix match made a team member equal to a store
  rep with the same first name and moved that rep's whole month into Direct. The
  two have different phones in `users_user`.
- **Rep on the cart beats booking branch.** Most orders on the B2B branch carry a
  store rep (the old grey "No B2B rep on cart"). The user's rule is who placed it,
  so those are EC-directed or not counted.
- **A lead or redirect counts only for carts raised on or after its date,** so a
  store customer who later became a lead is not claimed. Firms have no such gate.
- **The hero can exceed the Orders section, and the EC's own revenue overlaps it.**
  EC-directed and Referred are also in the stores' numbers. The hero is B2B's
  influence, measured against a target that `kpi-definitions.md` says counts EC,
  self and referrals. It is not added to company revenue.
- **Filters narrow the cards and table, not the hero.** The hero stays against the
  whole target. A line under the cards states the filtered share.
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

Real October was read through the compiled classifier in a signed-in production
tab on 2026-10-31. EC-directed was the largest channel, then Direct, with Referred
very small, and orders booked on B2B still tied to the old hero's total. The figures
stay out of this public repo. Client rows owned by an Inbound person count as KAM,
because they hold the firm. **Not checked:** whether Django
scopes this read for a non-admin token, and `/api/b2b/revenue` itself against real
data. Only the classifier ran on real rows; the route ran on the sandbox and answered
401 without a session. Check the route first once it is deployed or running on :3001.

## Why it was rebuilt

The user found the Dashboard text-heavy and hard to read, with panels left over
from before the Inbound, Outreach and KAM rebuilds. Several figures were also
shown two or three times. Achieved %, run rate and the target each had their own
panel. Revenue split appeared twice from two sources (Django verticals, and typed
Supabase values). "Pipeline by Stage" added New, In Progress, PI and Won across
three teams that do not share stages.

## The five sections, top to bottom

1. **B2B revenue, three channels.** See the section below. The hero is the sum of
   Direct, EC-directed and Referred against `b2bTargetL`, with a pace marker on
   the current month.
2. **Orders on the B2B branch.** Django's ledger for the `B2B` branch, so its Won is smaller than the hero. The period (this month · last month · all time) and the basis
   (order date · cart date) apply here. It shows booked, won and lost value,
   then each Django status as a tile. The tiles are sorted by value, with no
   arrows between them: Django returns the statuses in no meaningful order, and
   an arrow would claim a sequence. Open carts opens the existing drawer.
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

**Dropped on purpose; don't re-add them as panels:** Where It Came From (the Django vertical donut, replaced by the channels), Target
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
