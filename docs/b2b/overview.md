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
| `fetchVerticalStats` (1–3 calls) | Django `/crm/leads/stats/` | On open and on each period or basis change (`readRange`) |
| `fetchCRMLeads` | Django `/crm/leads/` | Only when Open carts is clicked |

## Why it was rebuilt

The user found the Dashboard text-heavy and hard to read, with panels left over
from before the Inbound, Outreach and KAM rebuilds. Several figures were also
shown two or three times. Achieved %, run rate and the target each had their own
panel. Revenue split appeared twice from two sources (Django verticals, and typed
Supabase values). "Pipeline by Stage" added New, In Progress, PI and Won across
three teams that do not share stages.

## The five sections, top to bottom

1. **Revenue, this month.** Revenue against target, with a marker at today's
   pace, so ahead or behind can be read from the bar. Under it: projection,
   needed per day and days left. On the right, "Where it came from", the Django
   vertical split (`revenueSources`, with its grey slice for carts held outside
   the roster). It is always this month, whatever period is picked below. The
   target is `b2bTargetL`, the sum of each team member's revenue target
   (`leadership.md`).
2. **Orders.** The period (this month · last month · all time) and the basis
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

**Dropped on purpose; don't re-add them as panels:** Target Achieved and Run
Rate (now in the hero), Pipeline by Stage, Pipeline by Vertical, the KAM §6
pipeline tiles, Target vs Revenue and Total Revenue Split. The last two used the
typed Supabase values, a third revenue number that agrees with neither Django
figure (`data-layer.md` §Targets is still a third number). Also dropped: the
cohort table (now a chart) and Account Temperature with its mismatch list.

Team colours (Inbound blue, Outreach amber, KAM teal, plus purple as a 4th
vertical) were checked with the dataviz palette validator: lightness, chroma,
CVD separation and contrast all pass. The old `#1A1A1A` / `#EAB308` set failed
three of those checks.

Checked 2026-10-30 in `npm run dev:sandbox` as Meera (manager): every section
rendered with no page errors, and only GETs were sent. Django, the B2B backend
and Kylas were stubbed there; Supabase was real.
