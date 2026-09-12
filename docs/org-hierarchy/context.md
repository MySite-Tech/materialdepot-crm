# lib/org (store hierarchy registry)

**Covers:** `lib/org/**`

## Purpose
One declarative model of the Material Depot store ladder — who sits where, who
checks them, and who is allowed to see their numbers. Added 2026-09-12 for the
Report Card revamp; it is deliberately not report-card-specific, because "who is
under me" is the same question the Weekly Funnel and Footfall tabs will ask next.

Sources: the ladder itself was given by the business (Admin/Central → Area
Manager → Cluster Head → Store Manager → Assistant Store Manager → Team Leader →
BM). The per-role duties and the maker–checker pairs come from the two decks in
`~/Desktop/Material Depot`: `EC Stakeholders Tasks.pdf` and
`Roles_and_SOP_Definition.pdf`.

## The ladder

| `depth` | Code | Stakeholder | Checked by | CRM roles |
|---|---|---|---|---|
| 6 | CT | Admin / Central Team | — | `admin`, `superadmin`, `tech` |
| 5 | AM | Area Manager | Central Team | `manager`, `area_manager` |
| 4 | CH | Cluster Head | Area Manager | `cluster_head` |
| 3 | SM | Store Manager | Cluster Head | `store_manager` |
| 2 | ASM | Assistant Store Manager | Store Manager | `asst_store_manager` |
| 1 | TL | Team Leader | Store Manager | `team_leader` |
| 0 | BM | Business Manager | Team Leader | `sales` |
| 0 | R | Receptionist | Store Manager | `retail` |

**`depth` decides visibility; `reportsTo` is only ever displayed.** They are two
different facts and merging them is the mistake to avoid. The SOP's checker
chain is not the ladder — the deck makes the TL *and* the ASM both answer to the
SM, skipping the ASM→TL rung, and it still called the SM's checker "Area Sales
Manager / Central Team" back when there was no Cluster Head. So "Checked by" on
the reporting-line strip reads from `reportsTo` and is faithful to the SOP,
while who-sees-whom is a plain depth comparison and is faithful to the ladder
the business asked for.

**The Receptionist shares depth 0 with the BM.** They cannot see each other
(the comparison is strictly greater), and everyone from TL up sees both. The
deck puts the receptionist's checker at the SM, so a TL seeing a receptionist is
slightly wider than the SOP — accepted deliberately, because the rule asked for
was "everyone above sees everyone below" and a receptionist's report card is
empty anyway (they own no leads).

**Four of the eight roles did not exist in this CRM before 2026-09-12.**
`team_leader`, `asst_store_manager`, `cluster_head` and `area_manager` were
added to `ROLE_OPTIONS` so an admin can assign them. `roleFromPermission`
returns `user_permission_detail.permission_name` verbatim when it is a string,
so a role round-trips as soon as Django knows it — but **whether Django's
permission table actually has rows for these four is not verifiable from this
repo**, and `PERMISSION_ID_TO_ROLE` (the numeric fallback) still stops at 15
with none of them in it. Until a real account carries one, those rungs are
empty and the ladder simply skips them: a BM's checker is the TL, but with no
TL in the roster the SM is still the first person above them who resolves.

`manager` is mapped to Area Manager. That is a judgement call — `manager` is the
only CRM role that has ever sat between `store_manager` and `admin`, and the
deck named the SM's checker "Area Sales Manager". It costs nothing if wrong,
because `central` sits above it either way.

## Who may see whose report card

`canViewReportCardOf(viewer, subject)` is the one function. Three gates, in
order:

1. **Yourself, always** — matched on `normalisePhone` (last 10 digits), because
   `/user-organisation/`'s `user.contact` and `/crm/available-bms/`'s `contact`
   do not agree on the `+91` prefix. The old report-card auto-pick carried a
   hand-rolled `replace(/^(\+?91)/, '')` for the same reason.
2. **Depth** — `depth(viewer) > depth(subject)`. Peers never see each other, so
   two `central` accounts cannot open each other's card.
3. **Branch** — `allowedBranches` must intersect, case-insensitively. **An empty
   list on either side means "all branches", not "none"** — see
   `docs/landmines.md`. This is what keeps a Cluster Head to their own cluster
   and a Store Manager to their own store, without any separate cluster table.

A CRM role that maps to no stakeholder (`procurement`, `post_sales`,
`customer_success`, …) is neither viewer nor subject: `buildTeam` returns
`unmappedRole: true` and an empty `reports`, and the Report Card says so in an
amber notice rather than rendering an empty list.

Verified 2026-09-12 against a 12-person roster spanning every rung: Central 10,
Area Manager 9, Cluster Head 7 (its two branches only — the Yelankha SM drops
out), Store Manager 5 (the Whitefield BM drops out), ASM 4, TL 3, and BM /
Receptionist 0. The inactive row appears in nobody's team.

## Things worth knowing

- **`buildTeam` drops `status === false`.** `fetchUsers` maps that to `active`,
  and an ex-employee would otherwise sit in every manager's team list forever.
- **Sorting is senior-first** (`STAKEHOLDER_ORDER`, derived from `depth` rather
  than hand-listed), then by name.
- **`STATS_BATCH = 50`** is a self-imposed URL-length cap for
  `bm_groups=`, not a known server limit. A 100-person team makes two calls.
- **`normaliseName` is for display grouping and for the one exact-match join
  described in `docs/report-card/context.md`. It is not a fuzzy matcher** and
  must never become one.
