# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, the leadership board (My performance for reps), dashboard and the Studio Space tab (~13.6k lines of components + 1.6k of domain/data).

Its data lives in the FastAPI `b2b-backend` (`newdb`), reached through
`app/api/b2b/[...path]` — **not** Supabase anymore. The read/write shapes and why
the mappers did not change are in [`data-layer.md`](data-layer.md); the backend
wiring and env vars are in `docs/backends.md`.

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, the one-tab lens tiles, the 5 pm work day, the call log and Ready to close, client details and SPoCs, Invalid as a status, Send to Outreach, the widened search, the Enq-ID resolve | 435 |
| [`outreach.md`](outreach.md) | The field half, meetings as an uncapped loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, no bulk import, the capture gate (role, team size, people, who was met, next follow-up), journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs with their rows and periods; the tile-lens page layout | 379 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 49 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; the list's lens tiles, chips and per-lens sort; parent-company grouping and why name is never a merge key | 293 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; tiles as clickable lenses; the 30/60-day account status; call dedupe; the unbuilt per-PI and check-in specs | 243 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load | 242 |
| [`studio-space.md`](studio-space.md) | The Studio Space tab (replaced Partner Content, 2026-10-29): link out to studio.materialdepot.com (no iframe, and why), the per-number onboarding list and the 25% KAM target, what is not synced to Studio Space | — |
| [`partner-bridge.md`](partner-bridge.md) | **Design only, not built.** The Outreach→KAM handoff PRD against this repo, and the push contract that feeds the partner dashboard | 149 |
| [`sales-tab-redesign.md`](sales-tab-redesign.md) | **Planning, in progress across sessions.** Manager-vs-individual effort/output visibility redesign — read before touching any `components/b2b/**` file for this initiative, and update every session | — |
| [`kpi-definitions.md`](kpi-definitions.md) | The user's Studio Team KPI sheet, transcribed — Outreach/Inbound/KAM effort vs. output targets and the CRM-field rules behind each one. Feeds the redesign above | — |
| [`leadership.md`](leadership.md) | Leadership Board (managers) / My performance (everyone else): one KPI engine per team over a date range, per person and per day; who the people are; targets and what is not scored yet | 137 |
| [`revamp-2026-10-28.md`](revamp-2026-10-28.md) | Engineer-facing change summary for branch `b2b-revamp-2026-10-28` (pushed, not merged): the team identity layer, Inbound round robin, Outreach rebuild, deploy prerequisites (migration, Azure env vars), how it was verified and known gaps | 333 |
| [`sandbox.md`](sandbox.md) | `npm run dev:sandbox`: the whole journey on dummy data with Django, the B2B backend and Kylas stubbed. Personas, what is still real, and which system answers each step in production vs here | 92 |

## Where the B2B work stands (2026-10-28)

`sales-tab-redesign.md` holds the per-team record. This is the short version, so
a new session knows what is live and what is being worked on.

- **Inbound: one tab (2026-10-29, evening),** with three tile groups: Call
  today, Pipeline and Outcomes. One predicate (`lensMatches`) gives both a
  tile's count and the list it opens. Leads after 5 pm count for the next
  working day. RNR is one click and books the next working day. Calls and notes
  are the B2B team's own record, kept out of Kylas. Ready to close (5 RNRs in 7
  days, or 7 days without progress) gates the no-response Lost reasons. Inbound
  sends leads to Outreach with a meeting location and a summary, and no longer
  hands to a KAM. See `inbound.md`. **It needs b2b-backend migration 0020
  deployed first** (`docs/backends.md`). Try it locally with `npm run
  dev:sandbox` (`sandbox.md`).
- **Client Database: the same lens tiles, built 2026-10-28.** All · Active ·
  Inactive 1 month · Inactive · No KAM, removable filter chips and sortable
  columns. The status dropdown is gone. See `client-db.md` §The list.
- **KAM: the same lens tiles, built 2026-10-28** (slice 3, minus Tier and Studio
  Space). See `kam.md` §The tiles are the navigation. Both tabs use
  `components/b2b/ui/lens-tiles.tsx`, and so does Client Database. **Outreach's
  own `LensStrip` (`views/outreach/lenses/`) is the one left.** It is committed
  (`818f516`) but not yet moved onto that component. That move is the next
  tidy-up, so that all four tabs share one tile shape.
- **KAM: its own 30 / 60-day status, and no header buttons (2026-10-29).**
  Active = ordered in the last 30 days, Inactive 1 month = 31–60 days,
  Inactive = more than 60 days or none. **Since that evening it is every
  firm's rule** (`clientStatus`), Client Database included, so the two tabs
  agree again. Export, Upload Orders and + Add Order are gone from the tab header
  (orders are added from a firm's page). See `kam.md` §Account status.
- **KAM, still to build (user's spec, 2026-10-29):** a follow-up date and a
  closure date **per PI** (follow-ups are per firm today), and a location plus
  photo-in-uniform check-in before every offline meeting for Outreach and KAM.
  Neither is started. Open questions are in `kam.md` §Not built yet.
- **2026-10-29, evening (the user's eight-point list):**
  - every firm is on the 30/60-day status;
  - Client DB has no export for anyone;
  - targets are monthly: KAM 500 calls and 35 meetings, Inbound 1,500 calls;
  - Partner Content is deleted and Studio Space replaced it (`studio-space.md`);
  - on the Firm page, each enquiry expands to its cart, dates, visits and remarks, and each number has a classification and Studio Space access, Power or Non-power (`client-db.md`);
  - admins assign Outreach leads from any source, and Client DB firms to KAMs, by name or round robin, and the assignee must accept or reject (`outreach.md`, `kam.md`). The Firm page's own KAM picker is managers-only and goes through the same sign-off.
  - **Not done:** enquiries cannot be found by GSTIN (needs a Django `gst` filter on `/crm/leads/`), and the Power user marking does not yet change access on Studio Space (needs a b2b-backend `/sync` write to `partner_user.visible_tabs`).
- **Where it lives.** All of the above is on branch `b2b-revamp-2026-10-28`.
  It is pushed but not merged or deployed (see `CLAUDE.md` §Git). Several
  sessions worked one tree that day. Run `git status --short -- components/b2b
  lib/b2b docs/b2b` before starting.

