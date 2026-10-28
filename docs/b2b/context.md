# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board, dashboard and the partner-content composer (~13.6k lines of components + 1.6k of domain/data).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, the widened search, the Enq-ID resolve | 238 |
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
