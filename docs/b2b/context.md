# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board and dashboard (~13.6k lines of components + 1.6k of domain/data).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates, the page-0 merge, the widened search, the Enq-ID resolve | 238 |
| [`outreach.md`](outreach.md) | The field half, meetings as a four-slot loop, KAM rotation | 76 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 44 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived; parent-company grouping and why name is never a merge key; who is pushable to the partner dashboards | 249 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; call dedupe | 145 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, the `ok`-flag rule, the roster, the two revenue numbers, chart colours, split load, the partner-dashboard relay | 234 |
| [`partner-bridge.md`](partner-bridge.md) | The Outreach→KAM handoff PRD against this repo, and the link to the partner dashboard. **P1 built 2026-09-21** (provisioning, the link roster, power users); P2–P4 still design | 265 |
