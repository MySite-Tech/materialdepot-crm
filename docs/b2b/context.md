# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board and dashboard (~13.6k lines of components + 1.6k of domain/data).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/b2b/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`inbound.md`](inbound.md) | The PRD, the three systems that hold one lead, Kylas field names, stages and gates | 127 |
| [`outreach.md`](outreach.md) | The field half, meetings as a four-slot loop, KAM rotation | 76 |
| [`leads.md`](leads.md) | One row per lead, three states in one column | 44 |
| [`client-db.md`](client-db.md) | One row per business; every order figure is derived | 138 |
| [`kam.md`](kam.md) | Clients and orders as two things; auto-advance; call dedupe | 145 |
| [`data-layer.md`](data-layer.md) | `lib/b2b` read shapes, the Kylas `total=0` trap, chart colours, split load | 63 |
