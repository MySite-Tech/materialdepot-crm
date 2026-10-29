# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, the leadership board (My performance for reps), dashboard and the partner-content composer (~13.6k lines of components + 1.6k of domain/data).

Its data lives in the FastAPI `b2b-backend` (`newdb`), reached through
`app/api/b2b/[...path]` — **not** Supabase anymore. The read/write shapes and why
the mappers did not change are in [`data-layer.md`](data-layer.md); the backend
wiring and env vars are in `docs/backends.md`.

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, the Clients / PI / Results tabs and their lens tiles, Invalid as a status, Send to Outreach, the widened search, the Enq-ID resolve | 378 |
| [`outreach.md`](outreach.md) | The field half, meetings as a four-slot loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, no bulk import, the capture gate (role, team size, people, who was met, next follow-up), journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs with their rows and periods; the tile-lens page layout | 379 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 44 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; the list's lens tiles, chips and per-lens sort; parent-company grouping and why name is never a merge key | 280 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; tiles as clickable lenses; the 30/60-day account status; call dedupe; the unbuilt per-PI and check-in specs | 228 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load | 120 |
| [`partner-content.md`](partner-content.md) | The Partner Content sub-tab: banners and New Launches pushed onto partner dashboards. No CRM-side store, the push is a diff, images travel as bytes | 95 |
| [`partner-bridge.md`](partner-bridge.md) | **Design only, not built.** The Outreach→KAM handoff PRD against this repo, and the push contract that feeds the partner dashboard | 149 |
| [`sales-tab-redesign.md`](sales-tab-redesign.md) | **Planning, in progress across sessions.** Manager-vs-individual effort/output visibility redesign — read before touching any `components/b2b/**` file for this initiative, and update every session | — |
| [`kpi-definitions.md`](kpi-definitions.md) | The user's Studio Team KPI sheet, transcribed — Outreach/Inbound/KAM effort vs. output targets and the CRM-field rules behind each one. Feeds the redesign above | — |
| [`leadership.md`](leadership.md) | Leadership Board (managers) / My performance (everyone else): one KPI engine per team over a date range, per person and per day; who the people are; targets and what is not scored yet | 125 |
| [`revamp-2026-10-28.md`](revamp-2026-10-28.md) | Engineer-facing change summary for branch `b2b-revamp-2026-10-28` (pushed, not merged): the team identity layer, Inbound round robin, Outreach rebuild, deploy prerequisites (migration, Azure env vars), how it was verified and known gaps | 251 |

## Where the B2B work stands (2026-10-28)

`sales-tab-redesign.md` holds the per-team record. This is the short version, so
a new session knows what is live and what is being worked on.

- **Inbound: three tabs, Clients · PI · Results (2026-10-29),** each with
  clickable lens tiles. One predicate (`lensMatches`) gives both a tile's count
  and the list it opens. A lead moves to PI once it has one, and the PI tab is
  date-ranged (default 30 days). Invalid is its own status with a hard gate, and
  Inbound now *sends* leads to Outreach. Outreach's pool shows only those. See
  `inbound.md` §The tiles are the navigation, and the Kylas-outage entry in
  `docs/landmines.md`.
- **Client Database: the same lens tiles, built 2026-10-28.** All · Active ·
  Lapsing soon · Inactive · No KAM, removable filter chips and sortable
  columns. The status dropdown is gone. See `client-db.md` §The list.
- **KAM: the same lens tiles, built 2026-10-28** (slice 3, minus Tier and Studio
  Space). See `kam.md` §The tiles are the navigation. Both tabs use
  `components/b2b/ui/lens-tiles.tsx`, and so does Client Database. **Outreach's
  own `LensStrip` (`views/outreach/lenses/`) is the one left.** It is committed
  (`818f516`) but not yet moved onto that component. That move is the next
  tidy-up, so that all four tabs share one tile shape.
- **KAM: its own 30 / 60-day status, and no header buttons (2026-10-29).**
  Active = ordered in the last 30 days, Inactive 1 month = 31–60 days,
  Inactive = more than 60 days or none. **KAM only**: Client Database keeps the
  3-month `clientStatus`, so one firm can differ between the two tabs on
  purpose. The dashboard's KAM section and Leadership KAM coverage follow the
  KAM rule. Export, Upload Orders and + Add Order are gone from the tab header
  (orders are added from a firm's page). See `kam.md` §Account status.
- **KAM, still to build (user's spec, 2026-10-29):** a follow-up date and a
  closure date **per PI** (follow-ups are per firm today), and a location plus
  photo-in-uniform check-in before every offline meeting for Outreach and KAM.
  Neither is started. Open questions are in `kam.md` §Not built yet.
- **Where it lives.** All of the above is on branch `b2b-revamp-2026-10-28`.
  It is pushed but not merged or deployed (see `CLAUDE.md` §Git). Several
  sessions worked one tree that day. Run `git status --short -- components/b2b
  lib/b2b docs/b2b` before starting.

