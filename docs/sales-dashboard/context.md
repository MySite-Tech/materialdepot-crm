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

## A raise goes through our backend, not through the webhook

Submitting on the raise screen POSTs to Django (`order/crm/escalation/raise/`),
which writes `cfRaiseEscalation` on the sales deal **and** clones the escalation
ticket, then reports the child deal id. The screen polls
`raise-status/` until that id exists and only then shows success.

It used to just PATCH the custom field and leave the cloning to the
`DEAL_UPDATED` webhook Kylas fires back at us. When that webhook did not
arrive there was no ticket, and nothing on the screen could tell: success was
inferred from Kylas returning 200 to the PATCH. **Never report a raise as
done off the PATCH alone** — the ticket is the deliverable, so wait for its id.

Send option **ids**, not names. `RAISE_OPTIONS` labels two options differently
from the Kylas option they point at — "Return" is Kylas's "Return Request",
"Order Modification" is "Modify Order" — so a name-keyed lookup refuses exactly
those two and no others, which is the kind of gap that survives a smoke test.

Duplicate suppression lives in Django: our own PATCH makes Kylas fire the
webhook, and the backend claim row is what stops it cloning a second ticket.
Nothing here needs to (or can) prevent that.

## The deal list is filtered by Kylas, not by us

The default list carries a `pipelineStage not_in [220516, 227603, 220520]` rule
(New Deal, Availability Confirmed, Followup) alongside the pipeline rule, so
only post-order deals come back. Filtering server-side is what keeps
`totalElements` and the pager honest — a client-side filter on a fetched page
makes both lie, and a page of 10 can render as 2 rows. An explicit search is
deliberately unfiltered: searching a name is the user asking for that deal.
