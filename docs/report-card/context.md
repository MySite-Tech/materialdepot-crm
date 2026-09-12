# components/report-card

**Covers:** `components/report-card/**` · `lib/api/dashboards/report-card.ts`

## Purpose
Your own monthly report card, and the card of everyone who reports into you.
Walk-in analysis, pipeline carts, orders lost, CRM adherence, closure pipeline
and rankings — seven numbered sections, one page.

Revamped 2026-09-12: before that it was "BM Report Card", a flat BM dropdown
listing **every** BM in the company to anyone who had the tab, with no notion of
who the viewer was beyond auto-selecting their own row. It now resolves the
viewer's place in the store hierarchy first and scopes everything to that.

## Data — two calls

| Call | Endpoint | What it decides |
|---|---|---|
| `fetchUsers` | `GET /user-organisation/` | who reports into the viewer (§ hierarchy) |
| `fetchReportCard` | `GET /crm/report-card/` | every number on the page |
| `fetchCategoryOptions` | `GET /category-list-all/` | the category filter |
| `fetchAvailableBMs` | `GET /crm/available-bms/` | **only on the roster-failure fallback** |

Four on mount at worst, and normally three — `/user-organisation/` is usually
already inside `mdFetch`'s 8 s GET cache because the Leads tab fetched it, and
`/crm/available-bms/` is not called at all unless the roster failed.

Filters differ from every other dashboard here: **`bm` and `category` are single
values, not arrays** (`branch` is still CSV). Default range is the current
calendar month — `monthStartISO()` to `monthEndISO()`, from the browser's clock.

| Response block | What it holds |
|---|---|
| `meta` | `bm_name`, `bm_contact`, `store`, the echoed date range, `category`, and **`has_bm`** |
| `walkin_analysis` | four `WalkinRow`s keyed `total` / `new` / `old` / `no_walkin` |
| `pipeline_carts` | five `PipelineCartRow`s keyed `total` / `active` / `warm` / `cold` / `dead` |
| `orders_lost` | `total` plus `reasons[]` with count/value and both percentages |
| `crm_adherence` | follow-up %, user-info %, TAT hours, weekday/weekend walk-in averages |
| `closure_pipeline` | `total_value` plus `clients[]`, each with a `stage` |
| `rankings` | `company_wide[]` and `within_store[]` |

## Hierarchy scoping

The rules themselves live in **`docs/org-hierarchy/context.md`**; this is what
the tab does with them.

`useTeam` calls `fetchUsers` once and hands `buildTeam` the viewer's
`id`/`name`/`phone`/`role` plus `allowedBranches` **joined into a string**. That
join is not cosmetic: `allowedBranches` is a fresh array on every render of the
shell, and keying the effect on it re-fetched the roster in a loop.

The viewer's branch scope is the `allowedBranches` **prop**, not
`currentUser.allowedBranches` — `useLeadsView` already blanks it for `admin`,
and blank means all branches.

What the scoping changes, concretely:

- The BM dropdown became a **person picker** built from the team, not from
  `/crm/available-bms/`. A BM now sees exactly one option: themselves.
- Section 01 **My Team** lists the reports with a per-row *View* button. It
  pages at 25 per the table rule and is searchable by name, phone or store.
- The store filter narrows the team as well as the numbers. Someone whose
  `branches` is empty stays visible under every store, because empty means all.
- The old section numbering shifted: what was 01–06 is now 02–07.

**If `/user-organisation/` fails the tab falls back to the old unrestricted
list** — every BM from `/crm/available-bms/`, with an amber notice saying the
roster did not load. A dropped request must never take access away; this is the
same reasoning as the `siteAudit` force-add in `docs/crm-shell/context.md`. It
does mean a roster outage is permissive, not restrictive: that is the deliberate
trade, because the alternative is an empty tab for everyone.

## The team ranking table, and why it is matched by name

Section 07 gains a **My Team** table above the existing two. It is filtered out
of `rankings.company_wide`, which already carries every BM's walk-ins, conv %,
cart %, sale value and FU % — so the whole team scoreboard costs **zero extra
requests**. Per-person `fetchReportCard` calls would have cost one request per
teammate and blown the ten-request budget on any real team.

The join is roster name → `rankings[].bm_name`, and it is **exact on
`normaliseName` (trim, collapse whitespace, lowercase) or it is not made at
all**. A name that appears more than once *on either side* is counted as
`ambiguous` and no row is guessed for it. The footnote under the table prints
all three outcomes — matched, not ranked in this range, could not be matched —
because collapsing "couldn't tell" into "no data" is exactly the failure the
identity rule exists to prevent.

Both sides come from the same Django user table, so the names agree in practice.
If that ever stops being true, the fix is a `contact` field on `RankingRow`, not
a looser matcher.

## Things worth knowing before answering a question about this page

- **`meta.has_bm` is the empty-state switch.** False means the filters resolved
  to no BM. It now renders a named panel — "No report-card data for <person> ·
  <their stakeholder role>" — rather than a generic prompt, because with the
  team list in front of you the common way to hit it is clicking a Receptionist
  or a Store Manager, neither of whom owns leads.
- **Nothing is fetched until a person is selected.** `personPhone === ''` skips
  the load effect entirely; *Reset Filters* clears it and re-arms the auto-pick
  by setting `autoPicked.current = false`.
- **`no_walkin` is a real bucket, not a total-minus.** It is the row for business
  that arrived without a store walk-in. Do not compute it by subtracting
  `new` + `old` from `total`.
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
