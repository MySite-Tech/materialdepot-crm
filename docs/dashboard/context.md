# components/dashboard

**Covers:** `components/dashboard/**` · `lib/api/dashboards/index.ts`

## Purpose
Two dashboards under one folder:

- `overview/` — the retail overview: per-branch status pies, lost-reason
  breakdown, and a closure pipeline table.
- `order-lost/` — the Order Lost dashboard: per-branch won/active/lost counts and
  values, bucketed by reason group, with a drill-down detail table and CSV export.

## Data

| Call | Endpoint |
|---|---|
| `fetchDashboardData` | `GET /crm/dashboard/` |
| `fetchOrderLostSummary` | `GET /crm/order-lost-summary/` → `data.branches` |
| `markLeadLost` | `PATCH /crm/lead-status/` |

`fetchDashboardData` returns four blocks in one call: `branchStatus` (per branch,
with a `statuses[]` of count+value), `lostReasons` (count, value and a
precomputed `pct`), `closurePipeline` (one row per lead) and `summary` (totals
plus today/week closure counts and the `weekFrom`/`weekTo`/`today` the server
used — **the week boundary is the server's, not the browser's**).

Both endpoints take `branch`, `bm`, `category`, `created_from/to` as CSV params.
The overview additionally takes `closure_from/to`; order-lost additionally takes
`cart_value_gt`/`cart_value_lt`.

## Reason buckets

Lost reasons are grouped into **Category / Retail / Other** by the backend and
arrive as `groupCount`/`groupValue` plus optional `reasonCount`/`reasonValue`
maps per group. The mapping lives on the Django side — the frontend only renders
the buckets it is given.

`normalizeReason` lowercases and strips every non-alphanumeric character before
comparing, so `"Cash/Non GST Issue"`, `"cash non gst issue"` and
`"CashNonGSTIssue"` are the same reason. Rely on that rather than exact strings.

`LOST_REASON_OPTIONS` is the write-side list for `markLeadLost`. It contains
**`'Availibility Issues'` — misspelled deliberately**, because that is the value
the backend stores; correcting the spelling here silently stops matching. It also
carries `'Not Responding'`, which the read-side reason groups do not.

## The detail table is paged, and capped

`DETAIL_PAGE_SIZE` 100, `DETAIL_MAX_PAGES` 30 — so the drill-down and its CSV see
**at most 3,000 rows**, and a branch/date window wider than that is silently
truncated. `CSV_FETCH_CONCURRENCY` is 4, which is the one place in this repo that
deliberately runs parallel requests; it stays at 4 because the export is a
user-initiated burst against a paginated endpoint, not a page load. Do not raise
it without re-reading the request budget in `CLAUDE.md`.

## Gotchas

- **`summary.today` / `weekFrom` / `weekTo` come from the server.** Do not
  recompute "this week" in the browser to label those numbers; IST vs the
  browser's zone will disagree at the boundary.
- `lostReasons[].pct` is precomputed. Recomputing it from count/total gives a
  different answer once filters are applied, because the server's denominator is
  the filtered set.
- `STATUS_COLORS` in `overview/constants.ts` is keyed by the status *label*, with
  `DEFAULT_STATUS_COLOR` (grey) as the fallback — a renamed status silently turns
  grey rather than erroring.
- Money is formatted three different ways on purpose: `fmtFull` (exact, grouped),
  `fmtShort` (Cr/L/k for chips) and `fmtRangeVal` (for filter range labels).
