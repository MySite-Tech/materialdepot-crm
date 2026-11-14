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
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates; **the CRM owns a lead once it is imported (2026-11-03): the import, CRM-only board, change-only saves, CRM-held owner, the owner cutover**; the lead window keeping unsaved work; the one-tab lens tiles, the 7 pm work day, the call log and Ready to close, client details and SPoCs, Invalid as a status, Send to Outreach, the widened search, the Enq-ID resolve; the round robin and who owns a lead | 617 |
| [`outreach.md`](outreach.md) | The field half, meetings as an uncapped loop, KAM rotation; the 2026-10-28 rebuild — scope, Inbound pool, no bulk import, the capture gate (role, team size, people, who was met, next follow-up), journey log, reminders, conversion rules, KAM handover, Studio Space waitlist, KPIs with their rows and periods; the tile-lens page layout | 379 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 49 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; the shared Firm page and inline number/GST edits; the list's lens tiles, chips and per-lens sort; parent-company grouping and why name is never a merge key | 293 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; tiles as clickable lenses; the 30/60-day account status; call dedupe; per-PI follow-up and closure dates; the unbuilt check-in spec | 243 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load | 242 |
| [`studio-space.md`](studio-space.md) | The Studio Space tab (replaced Partner Content, 2026-10-29): the Studio Space admin console framed in the tab (2026-10-30), the per-number onboarding list and the 25% KAM target, what is not synced to Studio Space, who sees which firm and how a CRM assignment reaches Studio Space (2026-10-31) | — |
| [`partner-bridge.md`](partner-bridge.md) | **Design only, not built.** The Outreach→KAM handoff PRD against this repo, and the push contract that feeds the partner dashboard | 149 |
| [`sales-tab-redesign.md`](sales-tab-redesign.md) | **Planning, in progress across sessions.** Manager-vs-individual effort/output visibility redesign — read before touching any `components/b2b/**` file for this initiative, and update every session | — |
| [`kpi-definitions.md`](kpi-definitions.md) | The user's Studio Team KPI sheet, transcribed — Outreach/Inbound/KAM effort vs. output targets and the CRM-field rules behind each one. Feeds the redesign above | — |
| [`ec-directed.md`](ec-directed.md) | EC Directed (2026-10-30): any team sends a client to an EC, kept as `kind='redirect'` EC visits; assisted revenue checked per redirect on click and saved, never added to a total; every team's drawer shows a client's redirects with cart and order steps (2026-11-06) | — |
| client_master import | The 1,000+ firms copied into the Client Database on 2026-10-31: [`client-db.md`](client-db.md) §The client_master import | — |
| Review new firms | Firms billed with a GSTIN on 12 months of orders and on no board; a manager sends each to the Client Database, Inbound, Outreach or a KAM, or marks it Not a client (2026-11-07): [`client-db.md`](client-db.md) §Review new firms | b2b-backend migration 0025 (`/client-review`) |
| Firm SPoCs | Four optional SPoCs on every firm and sales by SPoC (2026-10-31): [`client-db.md`](client-db.md) §Four SPoCs on every firm | — |
| [`ec-referral.md`](ec-referral.md) | EC B2B Referral (2026-10-31): the top-level form store staff use to hand a walk-in B2B client to Outreach, its own route and slug, the duplicate check | 44 |
| [`overview.md`](overview.md) | The Overview sub-tab (ex-Dashboard, rebuilt 2026-10-30): the four revenue channels by order type and booking branch, HQ before July 2026 (2026-11-03), the six-month trend, the drill-down to each enquiry, the Client Database funnel, how to audit a figure against production, what was dropped and why (incl. the B2B-branch panel), KAM's win rate vs a cumulative funnel, the validated colours | 265 |
| [`leadership.md`](leadership.md) | Leadership Board (managers) / My performance (everyone else): one KPI engine per team over a date range, per person and per day; revenue from the Overview's per-order report in four channels, a manager's per-order credit, Everything logged, the weighted score (2026-11-12); who the people are; targets and what is not scored yet. Also Set targets: per-person overrides of the sheet's targets, the B2B target as their sum, and who gets credited for a call a manager logs | 182 |
| [`revamp-2026-10-28.md`](revamp-2026-10-28.md) | Engineer-facing change summary for branch `b2b-revamp-2026-10-28` (PR #29 and #32 merged, #33 open): the team identity layer, Inbound round robin, Outreach rebuild, deploy prerequisites (migration, Azure env vars), how it was verified and known gaps | 333 |
| [`reminders.md`](reminders.md) | The Reminders tab for every B2B person (2026-11-06): what becomes a reminder and the tab rule each reuses, the IST time rules and the hour-before window, the follow-up time stored paired with its date and why, the shell-level refresh, opt-in desktop alerts and their limits | 120 |
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
  Inactive = more than 60 days, Never ordered = none (split out 2026-10-30).
  **Replaced on 2026-11-06 by month bands, 1–3, 3–6, 6–12 and 12+ months**
  (`kam.md` §Account status). **Since that evening it is every
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
- **2026-11-14, docs only (production data, no code):** Procurement's "Assigned to" is the estimate's assignee, not the deal ticket owner the revenue rule reads. `CLAUDE.md` and `inbound.md` said otherwise and are corrected. Five Direct orders on Vikas's leads, whose tickets Hardi owns, were credited to him per order, and the two blank Procurement assignees were set to him (`inbound.md` §The CRM's owner is written to Kylas). Django row 19's `crm_id` half is done (`docs/backends.md`).
- **2026-11-14, CRM PR #56 (live), no backend PR:** My performance's Inbound Qualified tile starts from every lead the person sent to Outreach, not only Outreach rows with an intake link. A lead still in Outreach's unassigned pool, or one a BM re-entered by hand, now shows, and an order placed at Inbound counts as converted (`leadership.md` §KPI rules, `docs/landmines.md`).
- **2026-11-14, CRM PR #52 (live):** a lead sent to Outreach leaves Inbound's Connected, Pipeline, Due, Overdue and Reminders lists (`withInbound`), and GST and expected value are no longer required for Inbound (`inbound.md`). PR #53 recorded where Procurement's owner fields come from (`inbound.md` §The CRM's owner is written to Kylas, `docs/backends.md` §Owed by Django row 19).
- **2026-11-14, Studio Space Power user / Normal user, branch `nov14-studio-tier` (with b2b-backend #34, migration 0029, and b2b-dashboard #46):** Studio Space onboards a firm as a Power user (every tab) or a Normal user (orders, clients, rewards). `/studio-access` sends each firm's `tier`; the CRM labels and filters by it, and Numbers by firm has Power users / Normal users tiles in place of "No power user" (`studio-space.md` §Power user or Normal user).
- **2026-11-14, CRM PR #50 and PR #51, both live, no backend PR:** revenue credits a cart's rep through their sign-in number, so a Django login named "none" no longer earns ₹0 (`overview.md` §Four revenue channels); the EC SPoC is never a B2B person, and the Client Database's EC SPoC column and filter read the store rep on the last EC order (`client-db.md` §Choosing the list's columns, §Four SPoCs); My performance has Refresh (`leadership.md`). PR #51: the CRM writes a lead's owner, and only the owner, back to Kylas on round robin, reassign and each sync (`inbound.md` §The CRM's owner is written to Kylas); Mandeep's 315 leads went to Hardi and Vikas, and 606 Kylas owners were corrected on production.
- **2026-11-12, branch `nov12-crm-dashboard` with b2b-backend `nov12-b2b-backend-changes` (migration 0026):** My performance reads revenue from the Overview's per-order report, in its four channels, and lists everything a person logged; a weighted KPI score from the sheet's weights; a manager credits any one order to anyone from its enquiry card (`leadership.md` §Revenue is the Overview's per-order rule, `overview.md` §A manager credits one order); the enquiry card names Django's ticket fields as the ticket's (`client-db.md` §One enquiry).
- **2026-11-06, branch `b2b-follow-up-reminders`, shipped 2026-11-07 in `release-2026-11-07`:** an optional time beside every follow-up date and a Reminders tab for everyone, with an hour-before window, a nav badge, opt-in desktop alerts and Open in place (`reminders.md`).
- **2026-11-06, branch `6-nov-changes` (cut from `main`, carries PR #43), pushed, no PR yet:** EC B2B Referral has three sub-tabs, Refer a client, Sent to your store and All referrals (`ec-referral.md` §Three views); Client Database and KAM use month bands, 1–3, 3–6, 6–12 and 12+ months (`kam.md` §Account status); Outreach puts BM and period in one filter bar driving the scorecard and pipeline (`outreach.md` §The page is tiles you click); the round robin also deals CRM rows left on the intake owner, with a manager-only backlog, and Team saves send only what changed (`inbound.md` §Why leads still read as Hardi's); order lookups use every number on the lead or firm (`inbound.md` §Enq ID → order value).
- **2026-11-05, CRM PR #43 → `main`, open, no backend PR:** orders show when they were placed (`client-db.md` §An order shows when it was placed, `overview.md`); the round robin inserts leads created before `B2B_FRESH_START` and qualified now (`inbound.md` §Who owns a lead); only the newest request is applied on Overview, Inbound and Leads, and Inbound's filters run in memory (`inbound.md` §Only a search reaches the network, `overview.md` §Only the month you picked); a merged firm's KAM state starts at its merge, and duplicate-finding is indexed (`client-db.md` §Merge).
- **2026-11-04, branch `b2b-firm-orders-ec-per-cart`, shipped 2026-11-07 in `release-2026-11-07`:** the Firm page says how many orders it cannot list, because `/crm/leads/` returns only deal tickets (Django ask row 18 in `docs/backends.md`); a PI shared tab; a B2B SPoC and an EC send on each open cart or PI, replacing the whole-firm redirect (`client-db.md`, `ec-directed.md`); SPoCs picked from the team; a filter on every Client Database column (`client-db.md` §Every column filters); Outreach's BM picker in the filter bar above the scorecard (`outreach.md`).
- **2026-11-03, CRM PR #39 → `main`, merged 2026-11-04:** the Overview's revenue is four channels by order type and booking branch, HQ before July 2026 (`overview.md` §Four revenue channels), with a six-month trend and the PI's items in every enquiry card; the B2B-branch panel and the channel-by-branch table are gone. This supersedes the 2026-11-01 and 2026-10-31 Overview bullets below.
- **2026-10-31, after PR #32, in open PR #33 and not on `main`:** the check-in is location only (`kam.md`); a KAM can only accept a firm (`kam.md`); pickers and filters use the live team and rep names match through `sameRep` (`data-layer.md`); My performance resolves KAM order values like Overview (`kam.md`); sales, retail, manager and admin get EC B2B Referral by role (`ec-referral.md`); the Inbound round robin keys on qualification time, repeats every 5 minutes while the tab is visible and survives Kylas 429s (`inbound.md` §Who owns a lead, `docs/api-layer/context.md`). A person must merge it.
- **2026-10-31, Studio and CRM sync, live:** Studio status per firm, Studio orders in firm revenue, referred clients on the Firm page, add-number from the CRM (`studio-space.md` §What is shared); parent company merge and delete firm, managers and admins only (`client-db.md` §Who can add, merge and delete). Backend half: b2b-backend #18.
- **2026-10-31:** EC B2B Referral is a new top-level tab and Outreach source (`ec-referral.md`). The shared assign bar is now One person or Round robin over a chosen set of people, on Client Database, Outreach's pool and the Leads tab (`leads.md`).
- **2026-11-03, PR `b2b-inbound-crm-owned` → `main` with b2b-backend #20:** Inbound is CRM-owned, with an insert-only Kylas import, no Kylas writes and change-only saves; the lead window asks before discarding edits; Leadership counts assigned leads from the CRM (`inbound.md`, `leadership.md`). Also carries the 2 Nov work: Inbound bulk reassign, rep scoping, a KAM tab scoped to the KAM, and forms staying open on a failed save (`kam.md`, `client-db.md`, `sales-tab-redesign.md`).
- **2026-11-03, CRM PR #42 with b2b-backend PR #21, both merged 2026-11-03:** the Team tab's Sign-in check and Change number, and a KAM tab that says why it is empty. A rep is matched by their sign-in number, and Krishna Jadhav's tab read 0 because he signs in on a second login. His data was merged in production by hand that day (`sales-tab-redesign.md` §Sign-in check and Change number, `kam.md` §Who sees which firms). The Django half is `docs/backends.md` §Owed by Django rows 15–17.
- **2026-11-01:** Overview figures open to their enquiries, the channel-by-branch table reconciles revenue with the B2B branch, and Client Database has a Columns picker with SPoC columns (`overview.md`, `client-db.md`).
- **2026-10-31, live:** the Overview's revenue is three channels, Direct, EC-directed and Referred, from per-order rows (`overview.md` §Three revenue channels).
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
  - admins assign Outreach leads from any source, and Client DB firms to KAMs, by name or round robin. An Outreach assignee accepts or rejects, and so does a KAM since 2026-11-03 (`outreach.md`, `kam.md`). The Firm page's own KAM picker is managers-only and goes through the same sign-off.
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

