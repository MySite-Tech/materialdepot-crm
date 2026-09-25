# components/weekly-funnel

**Covers:** `components/weekly-funnel/**` · `lib/api/dashboards/weekly-funnel.ts`

## Purpose
The weekly funnel table: one row per (week × customer type) with the
footfall → cart → PI → order funnel, plus four month-split tables underneath.

## Data

`fetchWeeklyFunnel` → `GET /crm/weekly-funnel/`, one call, five blocks:

| Block | Shape |
|---|---|
| `weekly_rows[]` | `week`, `customer_type`, funnel counts + percentages, `order_value`, `avg_order_value`, `avg_category` |
| `cart_split_by_month[]` | month × six value buckets + `total` |
| `order_split_by_month[]` | same shape, for orders |
| `category_split_by_month` | `top_categories[]` + `rows[]` (month → count per category) |
| `category_revenue_split_by_month` | same shape, revenue instead of count |

Filters `branch`, `bm`, `category` (all CSV) and `date_from`/`date_to`.

**The value buckets are fixed string keys** on `MonthSplitRow`: `0-25k`,
`25-50k`, `50-100k`, `100k-250k`, `250k-500k`, `500k+`. They are typed literally,
so changing a boundary is a backend *and* a type change, and the keys are the
column headers — there is no separate label map.

**The two category tables are column-dynamic.** `top_categories[]` decides both
the columns and their order; `rows[]` is indexed by category name
(`CategorySplitRow` is `{ month: string } & Record<string, number|string>`). A
category absent from `top_categories` is not rendered even if a row carries it.

## This module owns the two shared filter-option calls

`fetchCategoryOptions` (`GET /category-list-all/`) and `fetchAvailableBMs`
(`GET /crm/available-bms/`) are declared here but consumed by the report card and
the other dashboards too. `fetchCategoryOptions` trims each `category_name` and
**drops any category whose name is empty after trimming**, so the option count
can be lower than the row count the backend reports.

**`/crm/available-bms/?branch=X` is not "the people at X".** It lists everyone
Django links to that branch through any record, so on 2026-09-25 BASAVESHWARA
NAGAR returned 30 names of whom 5 were attached to it. With a `branch`,
`fetchAvailableBMs` also reads `/user-organisation/` and `bmsHomedInBranches`
drops anyone whose roster branches (matched on `normalisePhone`) don't include
one of the requested branches. An empty branch list means all branches, so those
people stay. So does anyone the roster does not list (usually an ex-employee
who still owns leads), because the roster can't place them.
A roster that doesn't come back as an array throws, and the callers' existing
`.catch` shows an empty picker. It never falls back to the leaky list. With no
`branch`, the roster isn't fetched and Django's list passes through unchanged.
Django only matches its own upper-case branch names, so a prettified name like
"Basaveshwar Nagar" gets 0 rows back.

## Gotchas

- Percentages (`cart_pct`, `pi_pct`, `order_pct`) arrive precomputed per row.
  Summing rows and recomputing gives a different answer, because each row's
  denominator is its own footfall.
- `avg_category` is an average *number of categories* per order, not a category
  name — the name is easy to misread.
- `fmtINR` switches unit at 1 Cr / 1 L / 1k, so the same column can show `₹2.15Cr`
  and `₹850` depending on the cell. That is intended for density; it means the
  column is not numerically sortable as rendered.
