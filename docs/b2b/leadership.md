*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Leadership Board / My performance (rebuilt 2026-10-28)

**Covers:** `components/b2b/views/leadership/**` · `components/b2b/models/performance/**` · `components/b2b/order-credit/**` · `lib/b2b/stats/targets.ts` · `lib/b2b/revenue/credits/**`

## Data

| Call | Endpoint | When |
|---|---|---|
| `fetchInboundForOutreach`, `fetchOutreachLeads`, `fetchClients`, `fetchKamOrders` | Supabase `b2b_lead`, one paged `select *` shared through the 8 s B2B cache | On open |
| `fetchInboundBoard` for the period, counted by `ownerId` | b2b-backend `/rows` (cached with every other B2B read) | Inbound team only, per period. One request for everyone since 2026-11-03. It read Kylas once per person (capped at 6) until the CRM took over ownership, and Kylas's owner no longer moves |
| `fetchStudioWaitlist` | `GET /api/b2b/waitlist` | Outreach team only, once |
| `fetchB2BBulk` via `useClientAggregates` | Django `/crm/leads/b2b-bulk/` | KAM team only, once |
| `fetchTargets` | backend `GET /target` (one `b2b_target` row), shared through the B2B cache | On open |
| `fetchRevenueReport` | `GET /api/b2b/revenue?from&to`, the Overview's report, server-cached per caller | Once per period picked; latest request wins (`useMonthReport`) |
| `fetchOrderCredits` | backend `GET /b2b/order-credits` through the relay | Once per session, shared with every tab (`OrderCreditsProvider`) |
| `fetchEcVisits({ kind: 'redirect' })` | backend `GET /b2b/ec-visits?kind=redirect` | On open, for Everything logged |
| `saveTargets` | backend `POST /target` | Set targets, a manager pressing Save targets |

On the sandbox on 2026-11-12, opening it as a manager made nine `/api/b2b/*`
reads (team, rows, target, order-credits, two revenue windows, trend, studio-access,
ec-visits); the trend and one revenue window are the Overview's, opened first.

Opening the Inbound board as a manager on 2026-10-28 took 6 Kylas counts plus
one automatic 429 retry and the waitlist call. The Supabase read was a cache hit
from the Dashboard; a cold open adds 1–2 more. An individual pays 1 Kylas call.
**Only Set targets writes**, the one target row, on Save.

## What it is

One sub-tab with two faces, chosen by `viewer.isManager` (`b2b.manager`, or role
`superadmin`/`admin`/`b2b_manager`):

- **Manager: "Leadership Board".** Pick a period and a team (Inbound · Outreach ·
  KAM). It shows the team's Effort and Output tiles, a compare table with one
  row per person (sortable on any KPI), and a day-by-day table. Clicking a person
  opens their own card and day-by-day table.
- **Everyone else: "My performance".** The nav label changes too. It shows the
  same card and day-by-day table for the viewer only. There is no team picker
  unless their name turns up on more than one team, no compare table and no team
  total. **This is a focus aid, not confidentiality:** the rows are read with keys
  the browser holds, the same as every other B2B tab (`sales-tab-redesign.md`
  §Visibility).

It replaced a rep leaderboard, "closing this week", two funnels and two top-client
lists. Those were output-only, keyed on `B2B_ROSTER` names, and summed typed
`value`s. The business numbers belong on the Dashboard (`sales-tab-redesign.md`
§Decisions).

## One engine per team, and the tiles, table and days use it

`models/performance/` has one `TeamEngine` per team: its KPI defs, who its people
are, and `card(data, people, period)`. **The tile, the compare cell, the
day-by-day cell and the list behind a tile all come from that one call.** It runs
over one person, everyone (the team total) or one day. Each KPI returns its rows,
with `counts` and a reason, the same contract as `outreachKpis`.

- **Outreach is not re-derived.** Its engine filters leads with `repOwns` and
  calls `outreachKpis`, so this tab and the Outreach scorecard cannot disagree.
  Checked 2026-10-28: Sai Suresh's row matched the Outreach tab's By BM row
  exactly. `repOwns` moved from `views/outreach/utils.ts` into
  `models/outreach/handover.ts` for this.
- **The team total is the card computed over everyone, not a sum of rows.**
  Unique-firm and % KPIs do not add up.
- **Day by day re-runs the card on each single day** (newest first, at most 62
  days, paged at 25). KPIs with `daily: false` are left out: coverage, handover
  and accounts ordering mean nothing for one day.
- **Unknown and nothing are different.** `PerfValue.unknown` is set only when a
  source failed (a team's `sources`, Kylas counts, the waitlist route, every
  firm's order history). Otherwise a value with no denominator renders "—". The
  first build showed every Sunday's adherence as "Unknown".

### Targets

The KPI sheet's numbers are the **defaults** in each engine's defs (`target`).
A manager overrides any of them per person under **Leadership Board → Set targets**. Overrides
are stored in `b2b_target.reps` (free JSONB, no migration needed) as
`{ "<team>|<personKey>": { "<kpiKey>": n } }`. `personKey` is the 10-digit
phone, or `name:<lowercased>` for someone with no phone. An Inbound lead owner who
is not on the team and shares a name with someone already listed gets
`kylas:<id>` instead. Before 2026-11-03 two Kylas users both stored as
"Mandeep" made two rows with one React key. A value equal to the
sheet default is not stored, so an untouched person follows the sheet when it
changes. The old `{ "<rep name>": { revenueTargetL, … } }` entries are dropped
on read. They belonged to the hardcoded roster and went away on the first save.

`targetFor(def, team, people, goals, …)` is the one function every tile, table
cell and the editor's team total reads. For counts and lakhs it **sums each person's goal**
(override or sheet), so a team total follows the overrides. For % it averages
them. Every count target is `per: 'month'` and shows only for a whole calendar
month, with pace inside the current one. The compare-table header reads "set per
person" once anyone on the team has an override for that KPI, instead of "/ n
each".
**Calls are monthly since 2026-10-29, at the user's instruction:** Inbound
1,500 a month per head, KAM 500 a month per head, KAM meetings 35 (the earlier
90 a day and 40 a day are gone). A partial-month or single-day period shows the
count with no target. `per: 'day'` still exists in `targetFor` but no KPI uses it. **Inbound revenue
(25 L), Inbound qualified (30) and KAM revenue (50 L) have no frequency in the
sheet. They are treated as monthly here; that is an assumption to confirm.**

## Revenue is the Overview's per-order rule (2026-11-12)

The user: KAMs, Inbound and Outreach could not track their own progress, and a KAM
whose order was on a firm assigned to someone else saw it counted for that person.
Revenue on this page now comes from the same per-order report as the Overview
(`/api/b2b/revenue` for the picked period), so the two can never disagree, and it is
split into the Overview's four channels.

- **`creditedOrders(data, team, people, period)`** (`models/performance/measures/revenue.ts`)
  is the one function the hero, the Inbound and KAM Revenue KPI, the compare table
  and every day-by-day cell read. An order is a person's when its `team` is the
  engine's team and either a manager credited it to them (phone first, then name) or
  the rule put their name on it (`o.person`, `sameRep`).
- **What it replaced.** Inbound counted Closed leads with a fetched Enq value, KAM
  counted Closed KAM-board orders. Both missed every order a store booked for the
  firm (the KAM sheet's "Everything: EC, self and referrals"), which the KAM
  engine had listed under Not scored. Outreach keeps its **New revenue (M0)** KPI,
  because the sheet defines it as first orders of new conversions only; the hero
  above it shows everything credited to the BM, and says so.
- **A day claims an order through `ticket.placedAt` only.** If any of the person's
  orders came with no placement time (Django not sending `orderPlacedAt`), each day's
  revenue reads Unknown with the reason, never ₹0. The whole period does not need it:
  the report is already windowed on the order date. The sandbox stub sends
  `orderPlacedAt` since this change; before, every day read ₹0 beside a ₹3.4L total.
- **KAM Ordering still reads KAM-board orders and the last-order date.** It is a
  count of firms, not money, and was left as it was.

### A manager credits one order to anyone

The rule cannot see who closed an order a store booked on an old ticket. The case
that raised it (ENQ20261107102736, 12 Nov): the deal ticket was opened on 12 Aug by
a Yelahanka store salesperson, who also built the 7 Nov cart. Django's ticket owner,
"Assigned to" on the card, is that person, and it never changed. The KAM who did the
work built no cart (one in 90 days), as the sheet's EC SPoC process intends. The
number sits on a Client Database firm whose first KAM assignment was 9 Nov, two days
after the order.

A B2B manager now overrides any order from its enquiry card (`OrderCreditLine`,
`overview.md` §A manager credits one order). The credit is per enquiry, not per
firm or lead, so it never moves other orders. It replaced the per-record
`revenueCredit` and `ui/credit-picker.tsx` of 2026-10-30, which production had
never used (0 rows on 12 Nov).

## The page, top to bottom (2026-11-12)

The user asked for the page to be "very nicely done". Order: header with period
chips (Today, Yesterday, This week, This month, Last month, Last 30 days, Custom);
the summary strip (who, team, period, weighted score); the revenue hero (total,
target and pace marker, a stacked channel bar, four channel tiles that open the
orders behind them in the Overview's `OrderDrawer`); Effort and Results KPI tiles,
each with a status label (On pace, Target met, Slightly behind, Behind), not colour
alone; the rows panel; the compare table (managers); Everything logged; Day by day.
The Inbound and KAM Revenue tile is hidden because the hero shows the same number.
A manager also gets a **person filter** beside the team buttons: everyone on all three
teams, grouped by team. Picking someone on another team switches to that team and
opens their card; "Everyone on …" goes back to the team. Clicking a compare-table row
does the same for the current team.
Last 7 days was dropped from the presets.

### Everything logged

`engine.activity(data, people, period, card)` lists what the person logged: calls
and meetings straight from their KPI rows (so the counts match the tiles), Inbound
and Outreach notes by author, Outreach journey events by `by` (status, handover,
BM change; meeting events come from the meetings themselves), KAM `Enquiry`
interactions, leads sent to Outreach, and EC redirects by `scheduledBy`. Redirects
are one extra read, `GET /b2b/ec-visits?kind=redirect`. Before this, notes, journey
events and redirects showed nowhere on the page.

### Weighted score

The KPI sheet gives every KPI a weight (Inbound 20/10/10/40/20, Outreach 10×4 and
15×4, KAM 10/10/5/5/10/10/10/30/10). `weightedScore` is Σ weight × min(1, value ÷
target paced to today) over the KPIs with a target and a value, divided by the
weight covered. It shows only for a whole month, because the sheet's targets are
monthly, and it says how much of the sheet's weight it covers: KAM covers 75%,
since Handover, Active rate of new accounts and Studio Space onboarding are not
scored. The weights are `weight` on each def.

## Set targets (2026-10-30; replaced the Targets tab)

The user's call: targets are set by leadership and the results already live on
the Performance view, so a separate tab showing results again was noise. The
Targets tab (`views/targets/`, built 2026-10-29) is deleted and its nav entry
gone. Managers get a **Performance | Set targets** toggle on this board;
reps never see it.

- **One table per team**: a row per active member of that team on the Team tab,
  a column per KPI that has a sheet target, and a Team row (sum, or average
  for %). A blank cell shows the sheet default in grey; a set cell is amber.
  Edits are a draft until **Save targets**, with Discard. One write, not one
  per keystroke.
- **The B2B monthly revenue target is the sum of every member's revenue
  target** across the three teams (`b2bTargetL`, `models/performance`). There
  is no separate number to set any more. The Overview (ex-Dashboard) target
  reads the same function. `monthly_target_l` is still stored but is read only
  while the team table is missing or failed to load.
- People with work but not on the team list get no row; add them on Team.

Checked 2026-10-30 in `npm run dev:sandbox` as Meera: Asha calls 1,200 and
revenue 30 saved as `inbound|9000000001 → {calls: 1200, revenue: 30}`, the B2B
target read ₹110L (Inbound 55 + Outreach 5 + KAM 50), and the Dashboard read
"of ₹1.10 Cr target".

## Who the people are

`team.members` (`b2b_team_member`) when the table is live. People who hold work
in the data but are not on the list are added, matched by name with `sameRep`
and marked "not on team". While the table is missing (true until b2b-backend
migration 0020 deploys) the list comes from the data: Inbound uses the
legacy `B2B_INBOUND_OWNER_LIST` plus lead owners, Outreach uses `bm`, and KAM
uses firm and order `kam`. Placeholder names ("Unassigned") are dropped.

**One person can be on several teams (2026-10-30).** The roster is one row per
person per team (b2b-backend migration 0023, primary key `(phone, team)`), each
with its own `in_rotation`. So someone on Inbound and Outreach gets a card for
each on My performance. `viewer.memberships` holds every active row and
`membershipIn(viewer, team)` picks one. `viewer.member` is the first, kept for
the display name. The B2B admin flag is written to every row of that person.

An individual is matched through `viewer.memberships` when they are on the list. Otherwise they are
matched by phone, or by name, against each team's people (`selfOn`). Someone who
matches nothing sees a notice, not an empty card.

## KPI rules that are not obvious from the defs

- **A call carrying `byPhone` is credited by phone first (2026-10-30).** If that
  phone is an active Inbound team member, the call counts for whoever has that
  phone and nobody else. Otherwise the name rule below applies. Names come from
  two Django sources (the profile's `name` at write time, the roster's
  `f_name l_name` frozen into the team list), and `sameRep` only tolerates case,
  a whole-word prefix and a roster `name`/`fullName` pair. So a rep whose two names differ never saw their own
  calls count. Calls logged before this carry no phone and still go by name.
- **Inbound calls are credited to `CallAttempt.by`, the caller — unless the
  caller is not on the Inbound team list, then to the lead's owner**
  (`onTeamList`, 2026-10-30). Before that, a call a manager logged on Asha's
  lead counted for the manager, who is on no team, so it counted for nobody:
  the user logged one as Meera and saw Asha's Calls not move. With no team
  list (table missing) the caller is always credited. Rows before 2026-10-28
  hold the owner in `by`, and every intake lead is created under Hardi, so on
  2026-10-28 all 311 October calls were credited to Hardi.
- **Inbound coverage** = leads created in the period and *now* owned by the
  person with at least one call ÷ Kylas's count of their leads created in the
  period. The Kylas count is stage-filtered (the two inbound stages), so the
  denominator is clamped to at least the CRM rows found. It shows Unknown if any
  person's count failed.
- **Inbound CRM adherence** is the sheet's mandatory list as fields exist today:
  contact name, mobile, firm name, segment, client type, city, a status past
  New, a follow-up date while open, and a note on every call. GST and address
  are left out (GST is "where available", and no address field exists). On
  2026-10-28 it read 1 of 267 for Hardi, mostly missing firm name and call
  notes. That is the real gap against the sheet, not a bug.
- **Inbound qualified** credits `intake.inboundOwner` (the owner at hand-off)
  once Outreach accepted *and* the lead converted or had 2 follow-ups. Rejected
  and waiting rows are listed and not counted.
- **Revenue is the Overview's per-order rule (2026-11-12).** See §Revenue is the
  Overview's per-order rule below. Work done before a reassignment is never moved:
  calls, meetings and interactions are credited to whoever logged them.
- **KAM meetings and calls are one per firm per day**, credited to
  `interaction.loggedBy` when that person is on the KAM team list, otherwise
  (or when empty) to the firm's KAM. Same rule as Inbound calls, same reason. Same dedupe as
  `callsLoggedOn`.
  **`loggedBy` is the viewer since 2026-10-30.** Before that the Log an
  interaction modal wrote the firm's KAM (or `KAMS[0]` when the firm had none),
  so a call was never credited to whoever actually made it. An `Enquiry`
  interaction counts toward neither calls nor meetings.
- **KAM coverage** uses Active (`clientStatus`: an order in the last 30 days,
  as of today) as its denominator, since 2026-10-29. It was a 3-month window
  before. `kpi-definitions.md` requires one meaning of
  "active" across KAM. Against the Django stub every firm is Inactive, so it
  reads "—".
- **KAM accounts ordering** = firms with a Closed KAM-board order in the period,
  or a `lastOrderPlaced` in the period, ÷ firms whose history loaded. The
  last-order date misses a firm that ordered in the period and again after it,
  and `b2b-bulk` serves future dates for some firms (`client-db.md`).

### Not scored, and why (shown on screen)

- KAM Studio Space onboarding: no Studio Space status on a firm.
- KAM active rate of last month's handovers: no handover date on a firm.
- KAM revenue from an order under a number the firm record does not hold (a site
  supervisor, the end client): waits on Django GST matching. EC and self orders on
  the firm's own numbers count since 2026-11-12.
- Inbound dead-lead automation: not built.

## Follow-ups worth doing

- `Pager` is imported from `views/kams/ui`. Move it into `components/b2b/ui/`
  when that folder is split; it is already over the 5-file limit.
- Outreach's `PeriodPicker` and this tab's are two pickers with different
  presets. If they should match, this one is the superset.
