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

Duplicate suppression lives in Django, and now covers two different duplicates.
Our own PATCH makes Kylas fire the webhook, and the backend claim row stops it
cloning a second ticket. Since 2026-09-16 the raise POST also dedupes *us*: a
repeat Submit while the first raise is still `pending`/`retrying` attaches to
that request instead of starting a second one, so the same `request_id` comes
back and the screen goes on polling the raise already running.

That guard matches only an **unfinished** raise. Once a ticket exists, the next
Submit creates another one — a second delivery delay on the same order is a
second problem, and the screen must not quietly refuse it. So nothing here
needs to (or can) block a repeat Submit, but equally nothing here should
*encourage* one; see below.

## The deal list is filtered by Kylas, not by us

The default list carries a `pipelineStage not_in [220516, 227603, 220520]` rule
(New Deal, Availability Confirmed, Followup) alongside the pipeline rule, so
only post-order deals come back. Filtering server-side is what keeps
`totalElements` and the pager honest — a client-side filter on a fetched page
makes both lie, and a page of 10 can render as 2 rows. An explicit search is
deliberately unfiltered: searching a name is the user asking for that deal.

## "retrying" is not "failed" — do not invite a re-submit

`raise-status/` returns `pending | retrying | success | failed`. **retrying**
means Kylas rate-limited us (429) and the backend is waiting out the window
before trying again on its own; the raise is still going to happen. Pressing
Submit again at that point only spends another call against the same limit, so
the timeout message distinguishes the two and tells the operator to wait.

Only **failed** is terminal and only it should ever say "try again". Before
2026-09-15 a 429 was reported as failed, which is what turned one rate-limited
raise into a run of manual retries into the same limit.

**Running out of poll attempts is not "failed" either.** The poll is 5s x 36,
three minutes — raised from one minute on 2026-09-16, when a Kylas backlog took
seven minutes to drain. Every raise submitted during it did land; the screen
simply stopped watching first, said it could not confirm the ticket, and the
error line then added "Press Submit again to retry" underneath. Operators did,
and one deal collected three real tickets (4774571, 4774572, 4774575) minutes
apart.

Two rules came out of that. The window is sized for a queued raise, not a
healthy one — three minutes of 5s polls costs fewer requests than the minute of
2s polls it replaced, so widening it was free. And the error line carries **no
blanket retry prompt**: each message says for itself whether anything was
created, because a timeout and a rejection need opposite advice and a fixed
suffix can only be right for one of them.
