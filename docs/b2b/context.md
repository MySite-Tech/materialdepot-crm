# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, the leadership board (My performance for reps), the Overview and the Studio Space tab (~13.6k lines of components + 1.6k of domain/data).

Its data lives in the FastAPI `b2b-backend` (`newdb`), reached through
`app/api/b2b/[...path]` — **not** Supabase anymore. The read/write shapes and why
the mappers did not change are in [`data-layer.md`](data-layer.md); the backend
wiring and env vars are in `docs/backends.md`.

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, the one-tab lens tiles, the 7 pm work day, the call log and Ready to close, client details and SPoCs, Invalid as a status, Send to Outreach, the widened search, the Enq-ID resolve | 435 |
| [`outreach.md`](outreach.md) | The field half, meetings as an uncapped loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, no bulk import, the capture gate (role, team size, people, who was met, next follow-up), journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs with their rows and periods; the tile-lens page layout | 379 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 49 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; the list's lens tiles, chips and per-lens sort; parent-company grouping and why name is never a merge key | 293 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; tiles as clickable lenses; the 30/60-day account status; call dedupe; per-PI follow-up and closure dates; the unbuilt check-in spec | 243 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load | 242 |
| [`studio-space.md`](studio-space.md) | The Studio Space tab (replaced Partner Content, 2026-10-29): the Studio Space admin console framed in the tab (2026-10-30), the per-number onboarding list and the 25% KAM target, what is not synced to Studio Space | — |
| [`partner-bridge.md`](partner-bridge.md) | **Design only, not built.** The Outreach→KAM handoff PRD against this repo, and the push contract that feeds the partner dashboard | 149 |
| [`sales-tab-redesign.md`](sales-tab-redesign.md) | **Planning, in progress across sessions.** Manager-vs-individual effort/output visibility redesign — read before touching any `components/b2b/**` file for this initiative, and update every session | — |
| [`kpi-definitions.md`](kpi-definitions.md) | The user's Studio Team KPI sheet, transcribed — Outreach/Inbound/KAM effort vs. output targets and the CRM-field rules behind each one. Feeds the redesign above | — |
| [`ec-directed.md`](ec-directed.md) | EC Directed (2026-10-30): any team sends a client to an EC, kept as `kind='redirect'` EC visits; assisted revenue checked per redirect on click and saved, never added to a total | — |
| client_master import | The 1,000+ firms copied into the Client Database on 2026-10-31: [`client-db.md`](client-db.md) §The client_master import | — |
| Firm SPoCs | Four optional SPoCs on every firm and sales by SPoC (2026-10-31): [`client-db.md`](client-db.md) §Four SPoCs on every firm | — |
| [`ec-referral.md`](ec-referral.md) | EC B2B Referral (2026-10-31): the top-level form store staff use to hand a walk-in B2B client to Outreach, its own route and slug, the duplicate check | 44 |
| [`overview.md`](overview.md) | The Overview sub-tab (ex-Dashboard, rebuilt 2026-10-30): five sections, what was dropped and why, KAM's win rate vs a cumulative funnel, the validated team colours | 70 |
| [`leadership.md`](leadership.md) | Leadership Board (managers) / My performance (everyone else): one KPI engine per team over a date range, per person and per day; who the people are; targets and what is not scored yet. Also Set targets: per-person overrides of the sheet's targets, the B2B target as their sum, and who gets credited for a call a manager logs | 182 |
| [`revamp-2026-10-28.md`](revamp-2026-10-28.md) | Engineer-facing change summary for branch `b2b-revamp-2026-10-28` (PR #29 and #32 merged, #33 open): the team identity layer, Inbound round robin, Outreach rebuild, deploy prerequisites (migration, Azure env vars), how it was verified and known gaps | 333 |
| [`sandbox.md`](sandbox.md) | `npm run dev:sandbox`: the whole journey on dummy data with Django, the B2B backend and Kylas stubbed. Personas, what is still real, and which system answers each step in production vs here | 92 |

## Where the B2B work stands (2026-10-28)

`sales-tab-redesign.md` holds the per-team record. This is the short version, so
a new session knows what is live and what is being worked on.

- **Inbound: one tab (2026-10-29, evening),** with three tile groups: Call
  today, Pipeline and Outcomes. One predicate (`lensMatches`) gives both a
  tile's count and the list it opens. Leads after 7 pm count for the next
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
  Inactive = more than 60 days, Never ordered = none (split out 2026-10-30). **Since that evening it is every
  firm's rule** (`clientStatus`), Client Database included, so the two tabs
  agree again. Export, Upload Orders and + Add Order are gone from the tab header
  (orders are added from a firm's page). See `kam.md` §Account status.
- **The structural list (2026-10-29),** built on `b2b-structural-2026-10-29`
  and merged into the revamp branch, so it is in PR #29: uncapped Outreach
  meetings; a name and role on the alternate number; minutes required on a KAM
  meeting; requirement history on Inbound, Outreach and KAM orders
  (`data-layer.md`); B2B admins made from the Team tab, and reps never falling
  through to everyone's leads; EC visits from any firm, shown in the
  Appointment Tracker (`client-db.md`); per-PI follow-up and closure dates
  (`kam.md`). It needs b2b-backend migration 0021, which is in PR #13 with
  0020 (`docs/backends.md`).
- **After PR #29 shipped (2026-10-29/30), on the branch but not on `main`:**
  Studio Space access is read, not assigned; Targets moved into the Leadership
  Board's "Set targets", and the B2B target is now the sum of every person's
  revenue target (`leadership.md`); Dashboard became **Overview**, with five
  sections and no duplicate panels (`overview.md`). These need a new PR to
  `main` to deploy.
- **2026-10-31, after PR #32, in open PR #33 and not on `main`:** the check-in is location only (`kam.md`); a KAM can only accept a firm (`kam.md`); pickers and filters use the live team and rep names match through `sameRep` (`data-layer.md`); My performance resolves KAM order values like Overview (`kam.md`); sales, retail, manager and admin get EC B2B Referral by role (`ec-referral.md`). A person must merge it.
- **2026-10-31:** EC B2B Referral is a new top-level tab and Outreach source (`ec-referral.md`). The shared assign bar is now One person or Round robin over a chosen set of people, on Client Database, Outreach's pool and the Leads tab (`leads.md`).
- **2026-10-30, evening (the user's second list):**
  - a meeting is checked in with an exact pin before it can be held, for Outreach and KAM (`kam.md` §A meeting starts with a check-in);
  - one person can be on several teams, with a round-robin switch per team (`leadership.md` §Who the people are);
  - revenue goes to the owner at close unless a manager credits someone else;
  - Client DB round robin takes only firms with no KAM;
  - EC Directed is a new sub-tab (`ec-directed.md`);
  - Inbound people carry a designation.
  - These need b2b-backend migration 0023 (`docs/backends.md`).
- **2026-10-29, evening (the user's eight-point list):**
  - every firm is on the 30/60-day status;
  - Client DB has no export for anyone;
  - targets are monthly: KAM 500 calls and 35 meetings, Inbound 1,500 calls;
  - Partner Content is deleted and Studio Space replaced it (`studio-space.md`);
  - on the Firm page, each enquiry expands to its cart, dates, visits and remarks, and each number has a classification and a Studio Space access read from Studio Space itself, Power or Normal (`client-db.md`, `studio-space.md`);
  - admins assign Outreach leads from any source, and Client DB firms to KAMs, by name or round robin. An Outreach assignee accepts or rejects; a KAM only accepts (`outreach.md`, `kam.md`). The Firm page's own KAM picker is managers-only and goes through the same sign-off.
  - **Not done:** enquiries cannot be found by GSTIN (needs a Django `gst` filter on `/crm/leads/`; the full list of Django asks is `docs/backends.md` §Owed by Django), and the CRM cannot grant or change Studio Space access, it only reads it (the read needs b2b-backend `GET /b2b/studio-access`, PR #14, not yet deployed).
- **2026-10-30:** the Studio Space tab frames the Studio Space admin console and signs the KAM in by their CRM phone (`studio-space.md`; needs b2b-backend PR #15, migration 0022).
- **Where it lives.** PR #29 (the revamp) is merged and deployed (2026-10-29).
  The branch `b2b-revamp-2026-10-28` kept taking commits after it (Studio Space
  access read-only, Targets, Leadership "Set targets", Overview, the Studio
  Space console, Inbound + Add lead, the Outreach meetings timeline). Those are
  pushed but not on `main` and not deployed: they need a new PR (see `CLAUDE.md`
  §Git). They ship in PR #30, which needs b2b-backend PR #14 (waitlist and
  Studio Space access reads, no migration) and PR #15 (Studio Space sign-in
  handoff, migration 0022) deployed first. Several
  sessions worked one tree that day. Run `git status --short -- components/b2b
  lib/b2b docs/b2b` before starting.

