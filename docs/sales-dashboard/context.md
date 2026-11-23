# components/sales-dashboard

**Covers:** `components/sales-dashboard/** · lib/api/ops/escalation.ts`

## Purpose
Mobile sales dashboard, two tabs: `raise` (raise an escalation) and
`escalation` (status tracking).

## The raise tab searches our backend, never Kylas

The raise tab calls Django `crm/escalation/order-search/?q=` (ENQ, phone or CT)
and builds every card from our own tables: the estimate (ENQ, value, customer,
stage), the deal ticket owner, `CRMIntegration` for the Kylas deal id and
`ci_escalation_deal` for existing tickets. It used to run a Kylas deal search on
every open and every search, plus an auto-sync when nothing came back. Kylas
rate-limits the whole tenant, roughly one call in three was refused in
Nov 2026, and those refusals landed on people trying to raise escalations.

Orders from Payment Pending onwards are returned (Kylas already carries an ENQ
deal at that stage), and there is no default list: the
screen is a search box, so opening the tab costs nothing. Customer-name search
was dropped on purpose, it scanned the estimate table and was the slow path.

A card with no Kylas deal id (`id: null`) is still raisable. Do not send people
to sync it first; the raise creates the deal itself (next section).

## A raise creates the Kylas deal when the order has none

When the order has no Kylas deal the raise POST sends `lead_id` instead of
`deal_id`. The backend accepts it under a `lead:<ENQ>` key and its Celery task
creates the deal first, then the ticket. `raise-status/` reports this as two
steps, `steps.deal` and `steps.ticket`, and the panel draws them as Deal in
Kylas, then Escalation ticket. A failed step offers "Retry from this step"
(`raise-retry/`), which reruns only what failed, so a deal that already exists
is never created again. The progress cards survive a refresh: `order-search/`
also returns `raises` (each order's raise requests from the last 24 hours, same
shape as `raise-status/` plus `lead_id`), the search seeds the cards from them
and resumes polling the pending ones, and opening an order no longer drops its
failed cards, so Retry stays reachable. For a Payment Pending / Order Placed order with no ENQ
deal yet, the customer's cart deal is synced with the order (renamed to the
ENQ) and then linked to that ENQ in `CRMIntegration`. Before that link existed
the cart deal stayed "the cart deal", got reused and renamed for the next cart
or order, and a later raise could land on a different order. This replaced the
"Create Kylas Deal" button and the
auto-sync after an empty search, which both spent Kylas calls before anyone had
decided to raise anything.

Each raise gets its own progress card, and Submit unlocks once the request is
accepted rather than once the ticket lands, so several reasons can be raised on
one order back to back. A successful raise is added to "ongoing requests" on
the spot, so the same-issue warning works without another search. Failed cards
are dropped when the order is reopened.

The backend cooldown is per **reason**, not per order: the same reason within
five minutes is refused, a different reason goes through.

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

Send option **ids**, not names. `RAISE_OPTIONS` labels are kept in sync with the
backend escalation reasons — as of 2026-10-01, the names and IDs match the
Django/Kylas option set. A name-keyed lookup would fail on any mismatch between
our labels and the upstream data, so the id is the only reliable key.

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

## Request Type and Raised by are the backend's, not the screen's

The raise POST still sends `request_type`, but Django ignores it and derives
Support/Escalation from the chosen option ids. Routing in Kylas depends on
`cfRequestType`, and OMS, procurement and hand-made Kylas tickets never pass
through this screen, so the rule lives in one place (CS Ops 2.3, 2026-09).

"Raised by" is `cfProjectPhase`, written by the backend as "Name (contact)".
It is **not** `paymentName`, although the requirement named that field: in
Kylas `paymentName` is the name column of Part Payments, and a bare value is
silently dropped. On sales deals `cfProjectPhase` still holds the customer's
project phase, so read it as "Raised by" only on escalation/support tickets.

## Sales raises only what sales can see

"Delivery Attempted" (202383) and "Material not ready" (212551) are not in
`RAISE_OPTIONS` (removed 2026-11-17): ops raises them, not the sales view. They
are still valid Kylas options, so tickets already carrying them display as usual.

## Status cards are titled like CS flow, not by deal name

The status tab titles a ticket `#<deal id> · <ENQ> · <Support|Escalation> ·
<first Raise Request>` (`dealHeading` in `escalation/utils.ts`), the same line
CS flow shows. The ENQ is matched in the deal name or `cfEscalationItemDetails`;
the type is Support only when `cfRequestType` says so. The full deal name stays
on hover.

## Notes go to cfNotes, and a failed raise keeps them

The optional note is sent as `notes` and stored verbatim as the ticket's
`cfNotes`. The backend also copies it to the ticket's Notes panel in the
background. The form clears only after a **successful** raise: a failure keeps
the chosen reason and the note, so the operator can retry without retyping.
Clearing on success matters too, or the last note rides into the next ticket.

## "Is it one of these?" warns, it never blocks

Ongoing requests list open tickets on the order plus the **latest closed** one,
with no date window (CS Ops 2.6). When the chosen reason matches one of them,
the form shows a banner with Open ticket and Add note, and Submit reads
"Create a new ticket anyway". It is information only, for the same reason the
raise guard never refuses a second ticket: a repeat issue can be a new problem.
Closed means `actualClosureDate` set, stage Ticket Cancelled / Escalation
Resolved, or installation status "Resolution Completed", the same rule the
backend auto-resolve uses.

## The status tab is a search, not a list

The status tab no longer loads a dated list on open. It runs one Kylas deal
search when someone searches (ENQ, ticket id or phone) and nothing before that.
The date chips, stage counts and pager went with the list.

Opening a ticket costs three Kylas calls: the deal, its notes and its call
history. Keep it there:

- Call history is one `call-logs/search` filtered by `related_to` the deal's
  contact. It used to page through the company's latest 1,500 calls and filter
  in the browser, which cost three calls and missed any customer whose calls
  were older than that window. Calls logged only against a lead from before it
  became a contact are not returned.
- The timeline is fetched only when "Show timeline" is pressed.
- A note or upload is added to the list locally instead of re-reading the deal
  and all of its notes.

The client-side `isEscalationOrSupport` filter checks pipeline IDs (32620
Escalation, 32616 Support), the same identifier the search uses. It used to
match pipeline names and silently dropped deals whose names did not match.

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
