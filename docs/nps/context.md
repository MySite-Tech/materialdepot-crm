# components/nps

**Covers:** `components/nps/**` · `lib/api/dashboards/nps.ts`

## Purpose
NPS dashboard with two tabs — Tracker (one row per store visit, submitted or
pending) and Overview (score cards plus a daily trend) — and the survey modal
that captures a response.

## Data

| Call | Endpoint | Returns |
|---|---|---|
| `fetchNPSTracker` | `GET /nps/tracker/` | one `NPSRow` per footfall record |
| `fetchNPSOverview` | `GET /nps/overview/` | today / yesterday / day_before / month cards + `daily[]` |
| `submitNPS` | `POST /nps/submit/` | `{ feedback_id }` |

Filters (`branch`, `from`, `to`, `search`) are server-side for both reads. Date
presets are computed client-side in `presetRange` — today, yesterday, last7
(6 days back inclusive), last30 (29 back), thismonth. **Default is last30.**

## How the score is computed

All in `components/nps/dashboard/utils.ts`. The backend sends raw rows; every
number on the page is derived in the browser.

- **Buckets:** score ≥ 9 Promoter, ≥ 7 Passive, otherwise Detractor. So 7–8 is
  passive and 0–6 is all detractor.
- **NPS** = `round((promoters/n − detractors/n) × 100)`, where `n` counts
  *unique reviews only*. Returns `null`, not 0, when there are no reviews — an
  empty state must not render as a score of zero.
- **Dedupe is by customer, keeping the latest visit.** `uniqueCustomers` keys on
  `c:<contact>` when a contact exists and falls back to `f:<footfall id>` when it
  is null, then keeps the row with the greatest `visit_date + ' ' + time`. So a
  repeat visitor counts once, and rows with no phone can never merge with
  anything. `uniqueReviews` is the same over submitted rows only.
- **Response rate** = unique reviewers ÷ unique customers, both after the base
  filters.
- A row counts as submitted only when `status === 'submitted'` **and**
  `score != null`.

## Gotchas

- **Filtering by Understood or Category silently drops pending rows.**
  `okUnderstood` and `okCategory` both return `false` for any row that is not
  submitted, so picking anything other than "all" narrows the tracker to
  responses. That is intended for the metric cards; it also changes the row count
  the Tracker tab shows.
- **`responseRate` uses `base`, not the filtered analysis set**, so it stays a
  property of the selected date/branch window rather than moving when you filter
  by promoter/detractor.
- `Q3_OPTIONS` ("what could be better") is a fixed four-item list in
  `constants.ts` with no backend counterpart — adding an option here does not
  need a migration, but old rows will never carry it.
- The CSV export is local (`exportCSV`), BOM-prefixed for Excel.
