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
The overview additionally takes `closure_from/to` and `priority`; order-lost
additionally takes `cart_value_gt`/`cart_value_lt`. `/crm/dashboard/` also takes
`order_from/to` and `branch_basis`, which only the category-revenue tab sends —
see **Dates filter on ORDER-PLACED date** below.

`priority` filters the **whole** payload, not just the pipeline table — the pies
and lost reasons narrow with it too, the same way `category` and `bm` do. Its
options come from `components/crm/constants` (`PRIORITY_FILTER_OPTIONS` and the
label↔value helpers) rather than a local list, so Hot/Warm/Cold/Not Set keep one
meaning across the leads table and the dashboard; `lead_priority` is stored on a
ticket's `extra_data`, so "Not Set" is a real, filterable state.

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
`CORE_CATEGORIES` (7), `NON_CORE_CATEGORIES` (11), `SPECIAL_CATEGORIES` (26).
Every entry is a CRM `category_name` from `/category-list-all/`, and
`buildSegregationTables` matches them **exactly** — a sheet row that is not one
of the CRM's names is flagged `unmatched`, rendered amber, and counts nothing.
It is never mapped onto the nearest-looking name, because a wrong mapping moves
real revenue into the wrong bucket and nothing downstream can detect it.

**There are three tables, not four.** The fourth, *Unclassified*, was removed on
2026-09-23 when the ten categories that sat in it were assigned: Liner Laminates,
Particle Board and Prelam Boards to Non-Core, and Artificial Grass, Ceiling
Tiles, Composite Floor, Customized Panels, Engineered Wood Floor, Glass and
Jaali to Special.

What replaced it matters more than what it was. A CRM category on none of the
three sheets no longer gets its own table — it would silently count in the store
Total and in **no** segregation — so `unclassifiedCrmCategories` names it in an
amber notice above the tables telling the reader to assign it in
`constants.ts`, and the footer's reconciliation line adds it to the causes of
the buckets-vs-total gap. Delete that notice and a new CRM category becomes
invisible revenue. It is the mirror of the existing `unmatchedSheetCategories`
notice (sheet row that is not a CRM category); both must stay.

`'Profiles and Mouldings'` is still unmatched — it is not a rename of
`'Wall Profile and Mouldings'`, which is a separate row on the same sheet.

### Four requests, and why rows are stores rather than categories

`loadBuckets` issues exactly **four** `/crm/dashboard/` calls — one unfiltered,
one per segregation with `category=` set to that bucket's whole CSV (it was five
while the Unclassified table existed). That endpoint returns `branchStatus[]`, so
four calls cover every store; a per-store loop would not.

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

Mount cost is **7 requests**: category list, BM list, targets, and the four
dashboard calls. The MTD effect and the filtered effect issue the *same* four
URLs on first render (the default range is month-to-date, no BM), and
`mdFetch`'s 8s GET cache collapses them — so the target panel is free on mount
and costs four only once a filter diverges from MTD.

### A mixed cart is split across segregations, in Django

Django's `category=` filter still selects deals whose cart **contains** one of
those categories, but since 2026-09-12 it values such a deal at the *share* of
its line items in those categories, not the whole cart. `_fetch_category_portions`
(`order/crm/leads/repository/leads_query.py`) divides the cart's matching
`EstimateItem.total_price` by its total and `to_dashboard_payload` scales
`cartValue` by that ratio into every aggregate. So a ₹1L cart of ₹60k tiles and
₹40k wallpaper is ₹60k of Core and ₹40k of Special, and the segregation
totals reconcile to the unfiltered total instead of summing ~32% above it
(Sept 2026: ₹4.41 Cr of buckets against a ₹3.34 Cr total, before the fix).

It is a **proportion**, not the line sum itself — scaling the cart value keeps
tax and additional charges inside the buckets, so they still add back up.

Two residues remain, both small and deliberate. A cart-stage deal matched on its
live `Cart` rows has no estimate to split and keeps its whole value. And a line
whose variant carries no category falls out of every bucket, so the three totals
can land a little *under* the real total — which is what the footer's gap figure
now measures. Do not close that gap by inflating a bucket.

`ORDER_STATUSES` mirrors `DEAL_ORDER_STATUSES` in `components/b2b/constants/client.ts`.
A status added to the CRM has to be added in both, or this tab and the Client
Database disagree about what an order is.

### Dates filter on ORDER-PLACED date, and that requires the estimate basis

`loadBuckets` sends `order_from`/`order_to` **with `branch_basis=estimate`**.
Both are required together: per `_filter_by_branch`
(`order/crm/leads/repository/leads_query.py`) the default `owner` basis keys a
branch off whoever holds the cart, and only the `estimate` basis keys it off
where the order was actually booked, which is what an order-placed date means.

This tab is read against Metabase's order book, so it has to share Metabase's
date basis. Until 2026-09-17 it filtered on **cart created date** instead, and
every store read low — Kompally Sept 2026 showed ₹47.48L against ₹57.18L,
the missing ₹9.71L being September orders on deals created in August or
earlier. B2B was the worst hit, ₹15.25L against ₹50.07L.

The order date is `order_placed_time` **coalesced to the estimate's
`created_at`**; a confirmed order that never got a placed-time stamped counts on
the day it was raised rather than vanishing. Two residues are not date-related
and cannot be closed here: an estimate with no deal ticket is invisible to the
CRM entirely (three exist across Jul–Aug 2026, ₹2.05L), and contacts in
`_CRM_EXCLUDED_CONTACTS` are deliberately dropped from the CRM while Metabase
still counts them — so a small permanent gap against Metabase is expected.

The **overview** tab still filters on `created_from`/`created_to` with the
default owner basis, which is right for a pipeline view. The two tabs therefore
disagree about the same month on purpose; they are answering different
questions.

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

### % of Target, and the two conditions on showing it

The store cards have always shown actual/target and a percentage. Since
2026-09-23 the **Category-wise Revenue** half shows it too: a `% of Target`
column on every segregation table (per store, plus the footer) and a `% of
Target` tile on the summary strip, all through one `pctOfTarget` helper in
`utils.ts` that the store card also calls — so the two halves cannot drift.

The column appears only when **both** hold, because a target is a monthly,
per-store, whole-store number:

- the selected range sits inside **one calendar month** (`targetMonth`), which
  is the month whose targets it is compared against — a range spanning two
  months has no single target to read against, so the column is hidden rather
  than compared against an arbitrary one;
- **no BM is selected** — a BM's share of a store cannot be read against a store
  target. This is the same reason the MTD panel ignores the BM chip.

The footer total compares the **visible stores'** summed revenue against their
summed target, not `result.overall.revenue`: `branchOptions` drops `HQ` while
the payload may not, and a percentage whose two halves cover different stores is
worse than no percentage. No target has ever been saved on live data
(`app_settings` is empty as of 2026-09-23), so every one of these reads `—`
until someone uses **Edit targets** — that is "no target set", not a bug.
