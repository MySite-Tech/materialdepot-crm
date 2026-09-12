# components/dashboard

**Covers:** `components/dashboard/**` · `lib/api/dashboards/index.ts`

## Purpose
Three dashboards under one folder, switched by the pill row in
`overview/index.tsx` (which owns the tab state for all three):

- `overview/` — the retail overview: per-branch status pies, lost-reason
  breakdown, and a closure pipeline table.
- `order-lost/` — the Order Lost dashboard: per-branch won/active/lost counts and
  values, bucketed by reason group, with a drill-down detail table and CSV export.
- `category-revenue/` — Core / Non-Core / Special revenue against store targets.

`ui/chips.tsx` and `utils.ts` sit at the feature root because `overview/` and
`category-revenue/` both import them; `order-lost/` keeps its own `chips.tsx`,
whose chips take different props (cart-value and days ranges).

## Data

| Call | Endpoint |
|---|---|
| `fetchDashboardData` | `GET /crm/dashboard/` |
| `fetchOrderLostSummary` | `GET /crm/order-lost-summary/` → `data.branches` |
| `markLeadLost` | `PATCH /crm/lead-status/` |
| `fetchCategoryOptions` | `GET /category-list-all/` |
| `loadSetting`/`saveSetting` (`dashboard_category_targets`) | Site Audit Supabase `app_settings` |

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

## Category revenue

### The segregation is a hand-kept registry, matched exactly

`category-revenue/constants.ts` holds the three segregation sheets verbatim:
`CORE_CATEGORIES` (7), `NON_CORE_CATEGORIES` (8), `SPECIAL_CATEGORIES` (19).
Every entry is a CRM `category_name` from `/category-list-all/`, and
`buildSegregationTables` matches them **exactly** — a sheet row that is not one
of the CRM's names is flagged `unmatched`, rendered amber, and counts nothing.
It is never mapped onto the nearest-looking name, because a wrong mapping moves
real revenue into the wrong bucket and nothing downstream can detect it.

Live as of 2026-09-10: the CRM has 41 categories, the sheets name 34, and
**`'Profiles and Mouldings'` is unmatched** — it is not a rename of
`'Wall Profile and Mouldings'`, which is a separate row on the same sheet. The
remaining 7 CRM categories (Artificial Grass, Ceiling Tiles, Composite Floor,
Engineered Wood Floor, Glass, Jaali, Particle Board, Prelam Boards) form a
fourth **Unclassified** table rather than being folded into a bucket, so the
four tables together account for everything the store's Total Revenue target is
measured against. Assign one on the sheet and it leaves that table.

### Five requests, and why rows are stores rather than categories

`loadBuckets` issues exactly **five** `/crm/dashboard/` calls — one unfiltered,
one per segregation with `category=` set to that bucket's whole CSV. That
endpoint returns `branchStatus[]`, so five calls cover every store; a
per-store loop would not.

**The tab shows one row per store, not per category, because per-category rows
would cost one request per category (41) and blow the ten-request budget in
`CLAUDE.md`.** The fix is a backend one: `/crm/leads/stats/?category_groups=`,
mirroring the `bm_groups=` parameter `fetchCRMLeadsStatsByBmGroup`
(`lib/api/crm/leads.ts`) already sends for the KAM board — `label:a,b|label2:c`
in, `{groups: {label: stats}}` out. When that ships, the per-category rows are a
small swap inside `SegregationSection`; nothing else changes. Until then the
category chips above each table carry the classification so it stays reviewable.

**Distinct Clients renders `—`, deliberately.** No endpoint returns a distinct
client count at any granularity, and computing it in the browser means paging
every deal in range. An empty cell that says so beats a number that is wrong.

Mount cost is **8 requests**: category list, BM list, targets, and the five
dashboard calls. The MTD effect and the filtered effect issue the *same* five
URLs on first render (the default range is month-to-date, no BM), and
`mdFetch`'s 8s GET cache collapses them — so the target panel is free on mount
and costs five only once a filter diverges from MTD.

### A mixed cart is split across segregations, in Django

Django's `category=` filter still selects deals whose cart **contains** one of
those categories, but since 2026-09-12 it values such a deal at the *share* of
its line items in those categories, not the whole cart. `_fetch_category_portions`
(`order/crm/leads/repository/leads_query.py`) divides the cart's matching
`EstimateItem.total_price` by its total and `to_dashboard_payload` scales
`cartValue` by that ratio into every aggregate. So a ₹1L cart of ₹60k tiles and
₹40k wallpaper is ₹60k of Core and ₹40k of Special, and the four segregation
totals reconcile to the unfiltered total instead of summing ~32% above it
(Sept 2026: ₹4.41 Cr of buckets against a ₹3.34 Cr total, before the fix).

It is a **proportion**, not the line sum itself — scaling the cart value keeps
tax and additional charges inside the buckets, so they still add back up.

Two residues remain, both small and deliberate. A cart-stage deal matched on its
live `Cart` rows has no estimate to split and keeps its whole value. And a line
whose variant carries no category falls out of every bucket, so the four totals
can land a little *under* the real total — which is what the footer's gap figure
now measures. Do not close that gap by inflating a bucket.

`ORDER_STATUSES` mirrors `DEAL_ORDER_STATUSES` in `components/b2b/constants/client.ts`.
A status added to the CRM has to be added in both, or this tab and the Client
Database disagree about what an order is.

Dates filter on **cart created date** — `created_from`/`created_to`. It is the
only date every deal carries; `closureDate` is an *estimated* closure, not a
booking date. A cart created in August and ordered in September counts in
August.

### Targets

One `app_settings` row, key `dashboard_category_targets`, shaped
`{ 'YYYY-MM': { STORE: { total, core, nonCore, special } } }`, in the **Site
Audit** Supabase (`components/site-audit/shared/sb-client.ts`) — the only store
this frontend can write to. Admin-only, gated by `canEditTargets`, which
`crm/shell/tab-panels.tsx` passes from `currentUser.role === 'admin'`.

Deliberately **not** merged into `cat_analytics_targets`: that object is keyed by
a different category vocabulary (site_audit / installation / wallpaper /
flooring / wallpanel / cnc) against the Metabase order book, and its numbers are
orders, not rupees.

`useCategoryTargets.save` **re-reads before writing**. The whole object is one
jsonb row, so saving a stale copy would silently revert another month someone
edited in the meantime. `coerceTargets` coerces every leaf because a hand-edited
blob is not a typed object — one bad cell would otherwise render `NaN%` across a
store card.

The MTD panel is fixed to the calendar month and the Store filter, and ignores
the Date Range and BM chips — otherwise "month to date" would not mean month to
date. A BM selection puts a note on the panel saying so.

A bucket whose request failed reads **Unknown**, not zero: `loadBuckets` uses
`Promise.allSettled` and omits the key, `StoreActuals` values are
`number | null`, and both the card and the table render the gap.
