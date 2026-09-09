# components/sales-dashboard

**Covers:** `components/sales-dashboard/** · lib/api/ops/escalation.ts`

## Purpose
Mobile sales dashboard, two tabs: `raise` (raise an escalation) and
`escalation` (status tracking).

## Contact → deals is one request, not one per deal

`SEARCH_FIELDS` asks Kylas for `associatedContacts`, so the deal-search response
already carries the association that the raise screen used to confirm with one
`/api/deals/<id>` request **per deal** — up to 200 of them for a single contact,
against a proxy with no dedupe cache. Match on the search payload; fall back to
the batched per-deal fetch only for deals whose `associatedContacts` is
`undefined` (absent from the response, not merely empty).

`/api/deals/*` is a route handler with no caching layer, so a loop here is a
loop of real network requests. See the request budget in `CLAUDE.md`.
