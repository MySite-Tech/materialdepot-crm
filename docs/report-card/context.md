# components/report-card

**Covers:** `components/report-card/**` · `lib/api/dashboards/report-card.ts`

## Purpose
The monthly branch/BM report card: walk-in analysis, pipeline carts, orders lost,
CRM adherence, closure pipeline and rankings — six sections, one page.

## Data — one call, six sections

`fetchReportCard` → `GET /crm/report-card/`. Everything on the page comes from
that single response; there is no second request and nothing is derived in the
browser beyond formatting.

Filters differ from every other dashboard here: **`bm` and `category` are single
values, not arrays** (`branch` is still CSV). The BM dropdown is populated by
`fetchAvailableBMs` → `GET /crm/available-bms/?branch=`, which lives in
`lib/api/dashboards/weekly-funnel.ts`, and categories by `fetchCategoryOptions`
→ `GET /category-list-all/`. Both are shared with the other dashboards.

Default range is the current calendar month — `monthStartISO()` to
`monthEndISO()`, both computed from the browser's clock.

| Response block | What it holds |
|---|---|
| `meta` | `bm_name`, `bm_contact`, `store`, the echoed date range, `category`, and **`has_bm`** |
| `walkin_analysis` | four `WalkinRow`s keyed `total` / `new` / `old` / `no_walkin` |
| `pipeline_carts` | five `PipelineCartRow`s keyed `total` / `active` / `warm` / `cold` / `dead` |
| `orders_lost` | `total` plus `reasons[]` with count/value and both percentages |
| `crm_adherence` | follow-up %, user-info %, TAT hours, weekday/weekend walk-in averages |
| `closure_pipeline` | `total_value` plus `clients[]`, each with a `stage` |
| `rankings` | `company_wide[]` and `within_store[]` |

## Things worth knowing before answering a question about this page

- **`meta.has_bm` is the empty-state switch.** False means the filters resolved
  to no BM, so the sections are structurally present but meaningless. Check it
  before reading any number.
- **`no_walkin` is a real bucket, not a total-minus.** It is the row for business
  that arrived without a store walk-in — see the footfall-decoupled-from-BM note
  in the Django repo. Do not compute it by subtracting `new` + `old` from `total`.
- **Cart temperature (`active`/`warm`/`cold`/`dead`) and closure stage
  (`HOT`/`WARM`/`COLD`/`DEAD`) are two different vocabularies** on the same page,
  cased differently and computed by the backend from different inputs. They are
  not the same axis and must not be merged in the UI.
- `crm_adherence.avg_weekday_walkin` and `avg_weekend_walkin` each carry **two**
  numbers, `bm` and `store` — the point of the section is the comparison, so
  never render one without the other.
- `rankings[].is_selected` marks the row for the currently filtered BM; that is
  how the table highlights "you" without the component knowing the BM name.
- Every percentage and `rank` is precomputed server-side. `fmtPct` tolerates
  null via `?? 0`, so a missing percentage renders as `0.0%` rather than blank —
  be careful reading that as a real zero.
