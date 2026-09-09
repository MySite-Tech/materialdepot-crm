# components/site-audit

**Covers:** `components/site-audit/** · app/site-audit-view · app/job-card · app/api/site-audit/**`

## Purpose
Site audit and installation operations: the field apps (auditor, installer, shadower), audit-ops, install-ops, COE ops, staff roster and capacity, and the oversight views. Largest module in the repo (~29.6k lines).

## Sub-documents

This module's detail is split by topic so a question costs one part, not the whole module. **Grep `docs/site-audit/` first**, then read the part that matched.

| Part | Covers | Lines |
|---|---|---|
| [`roles.md`](roles.md) | The three overlapping role models — `profiles.role`, CRM role, and permissions | 43 |
| [`staff.md`](staff.md) | Roster, joiners/leavers, daily caps and the probe-gated columns | 114 |
| [`orders.md`](orders.md) | Order attribution (exact matching only), the BM order book, and conversion | 188 |
| [`analytics.md`](analytics.md) | Analytics (two halves, two sources) and the review-score → NPS pipeline | 165 |
| [`coe.md`](coe.md) | The COE dashboard's six tabs and the three things they share | 107 |
| [`gotchas.md`](gotchas.md) | Pre-booking vs audit rows, empty-data-on-error, and two render-loop guards | 77 |
