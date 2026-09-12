# components/report-card

**Covers:** `components/report-card/**` · `lib/api/dashboards/report-card.ts`

## Purpose
Your own monthly report card, plus a performance table for everyone under you in
the store hierarchy, filterable by store, position and date range. Section 01 is
the team; sections 02–07 are the selected person's own card — walk-in analysis,
pipeline carts, orders lost, CRM adherence, closure pipeline and rankings.

Revamped 2026-09-12: before that it was "BM Report Card", a flat BM dropdown
listing **every** BM in the company to anyone who had the tab, with no notion of
who the viewer was beyond auto-selecting their own row. It now resolves the
viewer's place in the ladder first and scopes everything to that.

## Data — five calls, none of them per-person

| Call | Endpoint | What it decides |
|---|---|---|
| `fetchUsers` | `GET /user-organisation/` | who is under the viewer (§ hierarchy) |
| `fetchCRMLeadsStatsByBmGroup` | `GET /crm/leads/stats/?bm_groups=` | orders, sales value, AOV, pipeline, lost — **per person, keyed on contact** |
| `fetchFootfallDashboard` | `GET /crm/footfall-dashboard/` | footfall, carts, cart %, conv % — **per person, keyed on name** |
| `fetchReportCard` | `GET /crm/report-card/` | every number in sections 02–07 |
| `fetchCategoryOptions` | `GET /category-list-all/` | the category filter |
| `fetchAvailableBMs` | `GET /crm/available-bms/` | **only on the roster-failure fallback** |

Five on mount, six for a team over 50 (see `STATS_BATCH`). `/user-organisation/`
is usually already inside `mdFetch`'s 8 s GET cache because the Leads tab
fetched it, and `/crm/available-bms/` is not called at all unless the roster
failed.

**The team table deliberately does not call `/crm/report-card/` per person.**
That endpoint takes one `bm` at a time, so a ten-person team would have been ten
requests and a fifty-person team fifty — the budget decided the feature, the
same way it decided Category Revenue's rows. The two bulk endpoints above
already carry everything the SOP's own review checklist asks for (footfall
attended, cart creation %, order conversion %, pipeline, sales value closed,
AOV); only first-time-vs-repeat footfall is missing, and that needs
`/crm/footfall-repeat/`, which accepts no `bm` filter at all.

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
- Section 01 **Team Performance** is a metrics table over everyone under the
  viewer, with a **Position** multi-select, a text search and a per-row *Open*
  button. It pages at 25 per the table rule.
- The store filter narrows the team as well as the numbers. Someone whose
  `branches` is empty stays visible under every store, because empty means all.
- The old section numbering shifted: what was 01–06 is now 02–07.

**The stat tiles count the filtered set, not the page.** Paging never changes
them; the Position and search filters do, which is the point of having them.

**If `/user-organisation/` fails the tab falls back to the old unrestricted
list** — every BM from `/crm/available-bms/`, with an amber notice saying the
roster did not load. A dropped request must never take access away; this is the
same reasoning as the `siteAudit` force-add in `docs/crm-shell/context.md`. It
does mean a roster outage is permissive, not restrictive: that is the deliberate
trade, because the alternative is an empty tab for everyone.

## Two sources per row, and only one of them has an id

**Lead stats are keyed on contact and are therefore exact.**
`fetchCRMLeadsStatsByBmGroup` takes `label:contacts` groups, so the team table
sends one group per person using their phone as the label and reads the answer
straight back out of `groups[person.phone]`. No matching involved.

**Footfall is keyed on name and is therefore not.** `FootfallBMRow` carries
`bm_name` and nothing else — the `bm` *filter* accepts contacts, but the rows
that come back do not echo one. So `indexFootfallByName` joins on
`normaliseName` (trim, collapse whitespace, lowercase) and **only where the name
is unique on both sides**; a name that repeats in the roster or in the response
goes into `ambiguous` and no row is guessed for it.

That split is why the table can show a row where the money columns are populated
and the funnel columns read `—`, and why the note under it separates the three
outcomes: matched, no footfall row in this range, and could-not-be-matched.
Collapsing "couldn't tell" into "no data" is exactly the failure the identity
rule exists to prevent.

If the footfall join ever stops being good enough, the fix is a `contact` field
on `FootfallBMRow` in Django, not a looser matcher.

**Each source fails independently and says so.** A failed lead-stats call leaves
every money column reading "Unknown — the stats call failed" and the tiles
reading Unknown; a failed footfall call leaves the funnel columns Unknown. Never
a confident zero.

## Things worth knowing before answering a question about this page

- **`meta.has_bm` is the empty-state switch.** False means the filters resolved
  to no BM. It now renders a named panel — "No report-card data for <person> ·
  <their stakeholder role>" — rather than a generic prompt, because with the
  team table in front of you the common way to hit it is clicking a Receptionist
  or a Store Manager, neither of whom owns leads. Their row in section 01 still
  carries real lead-stat numbers, which is the point of having both.
- **`useTeamPerformance` keys its effect on `contactKey`, a joined string**, not
  on the `people` array — that array is rebuilt on every render and depending on
  it re-fetches in a loop. Same reason `useTeam` takes `branchKey` as a string.
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
