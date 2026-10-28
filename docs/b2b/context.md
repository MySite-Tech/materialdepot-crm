# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board, dashboard and the partner-content composer (~13.6k lines of components + 1.6k of domain/data).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, tiles as clickable lenses, the widened search, the Enq-ID resolve | 336 |
| [`outreach.md`](outreach.md) | The field half, meetings as a four-slot loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, CSV import, journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs | 265 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 44 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; parent-company grouping and why name is never a merge key | 242 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; call dedupe | 152 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load | 120 |
| [`partner-content.md`](partner-content.md) | The Partner Content sub-tab: banners and New Launches pushed onto partner dashboards. No CRM-side store, the push is a diff, images travel as bytes | 95 |
| [`partner-bridge.md`](partner-bridge.md) | **Design only, not built.** The Outreach→KAM handoff PRD against this repo, and the push contract that feeds the partner dashboard | 149 |
| [`sales-tab-redesign.md`](sales-tab-redesign.md) | **Planning, in progress across sessions.** Manager-vs-individual effort/output visibility redesign — read before touching any `components/b2b/**` file for this initiative, and update every session | — |
| [`kpi-definitions.md`](kpi-definitions.md) | The user's Studio Team KPI sheet, transcribed — Outreach/Inbound/KAM effort vs. output targets and the CRM-field rules behind each one. Feeds the redesign above | — |
| [`revamp-2026-10-28.md`](revamp-2026-10-28.md) | Engineer-facing change summary for branch `b2b-revamp-28oct`: the team identity layer, Inbound round robin, Outreach rebuild, deploy prerequisites (migration, Azure env vars), how it was verified and known gaps | 251 |

## Where the B2B work stands (2026-10-28)

`sales-tab-redesign.md` holds the per-team record. This is the short version, so
a new session knows what is live and what is being worked on.

- **Inbound: tiles are clickable lenses.** One predicate (`lensMatches`) gives
  both a tile's count and the list it opens. Today and List merged into one
  paged table, and the side panels are gone. A Kylas or database failure now
  reads "Unknown" rather than "0 · all called". See `inbound.md` §The tiles are
  the navigation and the Kylas-outage entry in `docs/landmines.md`.
- **KAM: the same treatment is planned, not built.** It is slice 3 in
  `sales-tab-redesign.md`. The plan:
  - Three tile groups. Follow-ups: Overdue · Due today · No follow-up set ·
    Calls today. Accounts: Assigned · Active · At risk, reusing `isAtRisk` with
    `daysToInactive`. Orders: Open orders (`KAM_OPEN_STATUSES`) · Pipeline
    (`KAM_PIPELINE_STATUSES`). Those are two different order sets, so they stay
    two tiles.
  - The tiles replace the `KAM_VIEWS` chips, which duplicate them. The Assigned
    Clients chip counted `filteredRows` while its tile counted `rows`.
  - One paged firm table. Overdue stays oldest-first (§4.3 FIFO). A paged order
    table serves the two order tiles, and the board stays one click away.
  - `todaysCalls`, `followUpQueue`, `CadenceList` and `KAM_VIEWS` are used
    only by this tab and go once it is built.
  - The tile component moves to `components/b2b/ui/`, so Inbound and KAM share
    one.
- **Parallel sessions.** The KAM Firm page landed as `7eb283e` while Inbound was
  in progress, and an Outreach session had uncommitted changes in
  `models/outreach` and `views/outreach` at the same time. Run `git status --short
  -- components/b2b lib/b2b docs/b2b` before starting, and see `CLAUDE.md`
  §Git for the rule.

