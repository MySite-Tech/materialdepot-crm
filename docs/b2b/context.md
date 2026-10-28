# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board, dashboard and the partner-content composer (~13.6k lines of components + 1.6k of domain/data).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, tiles as clickable lenses, the widened search, the Enq-ID resolve | 339 |
| [`outreach.md`](outreach.md) | The field half, meetings as a four-slot loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, CSV import, journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs with their rows and periods; the tile-lens page layout | 328 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 44 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; the list's lens tiles, chips and per-lens sort; parent-company grouping and why name is never a merge key | 280 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; tiles as clickable lenses; call dedupe | 195 |
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
- **Client Database: the same lens tiles, built 2026-10-28.** All · Active ·
  Lapsing soon · Inactive · No KAM, removable filter chips and sortable
  columns. The status dropdown is gone. See `client-db.md` §The list.
- **KAM: the same lens tiles, built 2026-10-28** (slice 3, minus Tier and Studio
  Space). See `kam.md` §The tiles are the navigation. Both tabs use
  `components/b2b/ui/lens-tiles.tsx`. **Outreach's own `LensStrip`
  (`views/outreach/lenses/`) should move onto that component** once its session
  commits, so all three tabs share one tile shape.
- **Parallel sessions.** The KAM Firm page landed as `7eb283e` while Inbound was
  in progress, and an Outreach session had uncommitted changes in
  `models/outreach` and `views/outreach` at the same time. Run `git status --short
  -- components/b2b lib/b2b docs/b2b` before starting, and see `CLAUDE.md`
  §Git for the rule.

