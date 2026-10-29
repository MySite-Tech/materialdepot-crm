*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Leadership Board / My performance (rebuilt 2026-10-28)

**Covers:** `components/b2b/views/leadership/**` · `components/b2b/models/performance/**`

## Data

| Call | Endpoint | When |
|---|---|---|
| `fetchInboundForOutreach`, `fetchOutreachLeads`, `fetchClients`, `fetchKamOrders` | Supabase `b2b_lead`, one paged `select *` shared through the 8 s B2B cache | On open |
| `fetchB2BInboundLeads(…, size=1)`, once per linked inbound person, **one at a time** | Kylas `POST /search/lead` (two inbound stages, `createdAt` in the period) | Inbound team only, per period. Capped at `KYLAS_COUNT_CAP` (6). Successful counts are cached per person and period |
| `fetchStudioWaitlist` | `GET /api/b2b/waitlist` | Outreach team only, once |
| `fetchB2BBulk` via `useClientAggregates` | Django `/crm/leads/b2b-bulk/` | KAM team only, once |

Opening the Inbound board as a manager on 2026-10-28 took 6 Kylas counts plus
one automatic 429 retry and the waitlist call. The Supabase read was a cache hit
from the Dashboard; a cold open adds 1–2 more. An individual pays 1 Kylas call.
**Nothing on this tab writes.**

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

`targetFor` scales by head count. Every count target is now `per: 'month'`
and shows only for a whole calendar month, with pace inside the current one.
**Calls are monthly since 2026-10-29, at the user's instruction:** Inbound
1,500 a month per head, KAM 500 a month per head, KAM meetings 35 (the earlier
90 a day and 40 a day are gone). A partial-month or single-day period shows the
count with no target. `per: 'day'` still exists in `targetFor` but no KPI uses it. **Inbound revenue
(25 L), Inbound qualified (30) and KAM revenue (50 L) have no frequency in the
sheet. They are treated as monthly here; that is an assumption to confirm.**

`DAILY_CALL_TARGET` (the KAM tab's and Dashboard's "calls today" bar) is
derived from the monthly 500 over 26 Mon–Sat working days, rounded up: 20. The
two can no longer disagree.

## Who the people are

`team.members` (`b2b_team_member`) when the table is live. People who hold work
in the data but are not on the list are added, matched by name with `sameRep`
and marked "not on team". While the table is missing (true until b2b-backend
migration 0020 deploys) the list comes from the data: Inbound uses the
legacy `B2B_INBOUND_OWNER_LIST` plus lead owners, Outreach uses `bm`, and KAM
uses firm and order `kam`. Placeholder names ("Unassigned") are dropped.

An individual is `viewer.member` when they are on the list. Otherwise they are
matched by phone, or by name, against each team's people (`selfOn`). Someone who
matches nothing sees a notice, not an empty card.

## KPI rules that are not obvious from the defs

- **Inbound calls are credited to `CallAttempt.by`, the caller.** Rows before
  2026-10-28 hold the owner there, and every intake lead is created under Hardi,
  so on 2026-10-28 all 311 October calls were credited to Hardi.
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
- **Revenue (Inbound and KAM) counts only Enq-fetched values**
  (`orderValueSource === 'deal'`). Typed values are listed as "not counted".
- **KAM meetings and calls are one per firm per day**, credited to
  `interaction.loggedBy`, falling back to the firm's KAM. Same dedupe as
  `callsLoggedOn`.
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
- KAM revenue from EC/self orders: waits on Django GST matching.
- Inbound dead-lead automation: not built.

## Follow-ups worth doing

- `Pager` is imported from `views/kams/ui`. Move it into `components/b2b/ui/`
  when that folder is split; it is already over the 5-file limit.
- Outreach's `PeriodPicker` and this tab's are two pickers with different
  presets. If they should match, this one is the superset.
