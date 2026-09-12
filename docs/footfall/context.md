# components/footfall

**Covers:** `components/footfall/**` · the footfall half of `lib/api/dashboards/index.ts`

## Purpose
The Footfall tab, three views behind one tab bar (`footfall-tab.tsx`):

- `dashboard/` — the conversion funnel with per-BM and per-branch tables, plus
  two drill-down tables (no-cart, non-converted).
- `footfall-repeat-dashboard.tsx` — repeat-customer buckets, current month vs
  everything up to last month.
- `footfall-breakdown-dashboard.tsx` — a metric-per-row × store-per-column grid.

## Data — five separate endpoints

| Call | Endpoint | Shape |
|---|---|---|
| `fetchFootfallDashboard` | `/crm/footfall-dashboard/` | funnel totals + `by_bm[]` + `by_branch[]` |
| `fetchFootfallNoCart` | `/crm/footfall-no-cart/` | paged rows, `has_deal_ticket?` |
| `fetchFootfallNonConverted` | `/crm/footfall-non-converted/` | paged rows |
| `fetchFootfallRepeat` | `/crm/footfall-repeat/` | `rows[]` + `total` + `current_month` |
| `fetchFootfallBreakdown` | `/crm/footfall-breakdown/` | `stores[]` + `rows[]` |

All take `branch`, `bm`, `category` as CSV and `date_from`/`date_to`. The two
drill-downs add `page`, `page_size` and `q`. **`fetchFootfallRepeat` is the
exception — it accepts only `branch` and the date range**, no `bm` and no
`category`, so the repeat view cannot be narrowed the way the others can.

## The funnel

`footfall_users → cart_users → pi_users → order_users`, with `cart_pct`,
`pi_pct` and `order_pct` arriving precomputed. Every percentage on this tab is
the server's — `fmtPct` only formats to one decimal. The same
`FootfallFunnelStats` shape is reused for the totals, each `by_bm` row and each
`by_branch` row, so one renderer serves all three.

## Repeat view

Rows are buckets (by visit count), each carrying a paired
`*_current` / `*_till_last` metric: `orders`, `sales`, `aov`, alongside
`unique_clients`. `current_month` names the month `*_current` refers to — label
the column from that field rather than from the browser's clock. `total` is a
row of the same shape, supplied by the server, not summed client-side.

## Breakdown view

Each row is one metric: `key`, `label`, a `comment` (rendered as the column's
hover tooltip), a `kind` of `int` | `money` | `pct` that selects the formatter,
`values` keyed by store name, and a `total`. Columns come from `stores[]`, so
**the column set is data-driven** — a new store appears with no frontend
change, and a store with no rows still gets a column.

`comment` is the only explanation of what a column means and how it is derived,
and it is **authored server-side** in `breakdown_service.py`'s `row()` calls —
the frontend never writes metric copy. `InfoTip` renders it as the ⓘ after each
heading, so a wording fix ships with the backend and needs no CRM deploy.

## Gotchas

- `has_deal_ticket` on the no-cart rows is optional. Absent is not false — it
  means the backend did not report it for that row.
- The drill-down tables are server-paged; `count` and `total_pages` come from the
  response. Do not derive page count from `results.length`.
- `fmtDate` here splits the ISO string by hand into `dd/mm/yyyy` and never
  constructs a `Date`, which is deliberate: it cannot shift a date across the IST
  boundary.
- `InfoTip` portals its tooltip to `document.body` and positions it from
  `getBoundingClientRect`. It cannot be a plain absolutely-positioned child: the
  table sits in an `overflow-x-auto` wrapper, which computes `overflow-y` to
  `auto` and would clip the bubble. The same rect maths clamps it into the
  viewport, so the right-hand AOV columns do not open a tooltip off-screen.
