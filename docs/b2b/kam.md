*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The KAM module: clients and orders are two things now

`components/b2b/models/kam/` implements `KAM_Module_PRD.docx` v1.0 (KK).
`components/b2b/views/kams/index.tsx` is the tab, rebuilt around it.

§7 says the module "shares its client universe with the Client Database", so an
assigned client IS a `ClientEntity` and §3's interactions live on that record.
This module owns exactly one stored thing: the **Active Order**, still the same
`pipeline='kam'` rows — 30 of them, live, split between two KAMs who are
actually using them.

### The old board's seven stages, mapped on READ

`normalizeKamOrderStatus` is load-bearing, not a courtesy — nothing is rewritten
in place, so the board is correct whether or not any row is ever re-saved:

| Stored (live count) | Reads as |
|---|---|
| `No Active Enquiry` (1) | `Requirement Logged` |
| `Quote Approval Pending` (3) | `Quote Shared` |
| `PI Shared` (0) | `PI Shared` |
| `Awaiting Payment` (0) | `PI Shared` — the PI is out and the money is not in; the PRD has no payment state |
| `Order Placed` (16) | `Closed` — §5.2 defines Closed as "once the order is placed" |
| `Closed` (9) | `Closed` |
| `Lost` (1) | `Lost` |

`Requirement Logged` is a fifth status the PRD does not name and cannot avoid:
§5.1 has a KAM type a requirement and an estimate at creation, and §5.2's
earliest status already asserts a quote went out. One live row is in exactly
that condition. Same reasoning as Inbound's `New` and Outreach's `Scheduled`.

### This was the third board counting a typed guess as revenue

`b2b_lead.value` on a KAM row was a figure a KAM typed on the old form, and
`analytics.ts` had to **exclude the whole `Order Placed` column from revenue**
to avoid reporting invented money off the 16 auto-advanced rows. Now:
`KamOrder.estimatedValue` is the §5.1 estimate (legacy `r.value` migrates into
it on read, and the fallback must never be removed — it is the only figure 30
live rows carry), `orderValue` comes from the deal ticket via `lookupEnqId`, and
`value` — the column analytics sums — is `orderValue || 0`. **Do not put a typed
figure into `value`.** That is what makes collapsing `Order Placed` into
`Closed` safe.

**Consequence worth knowing before someone reports it as a bug:** a closed order
whose Enq ID has not resolved contributes ₹0 revenue. On the KAM tab
`resolveKamOrders` fetches and PERSISTS the values on load; the Dashboard
resolves for DISPLAY only and states how many are unresolved beside the revenue
tile. One writer, two readers — deliberately, because two surfaces writing the
same rows on load is how the duplicate auto-advance note below got written.

### Auto-advance now keys on the order's own ticket

`components/b2b/models/kam/auto-stage.ts` still moves an order forward off its deal status, forward-only,
never out of Closed/Lost. What changed is rule 3: it matches the order's **own**
Enquiry ID exactly, where it used to key on `furthestStatus` for the client's
PHONE — a lifetime figure across every deal that client ever raised. On the old
one-row-per-client board that was coarse; now that a client holds several orders
it is wrong, and one closed order would advance every other open order on the
account. An order with no Enq ID is left alone and the UI says so. Verified
live: `RK Interiors` did not advance despite its phone carrying a Delivered
ticket, because the order stores no Enq ID.

The audit note is also no longer written twice. The old code reasoned that
storing the new stage made a repeat impossible; live row
`KAM-1787743441579-4` carries `"Auto-advanced PI Shared → Order Placed (cart
status: Delivered)"` **twice**, because the write that would have prevented the
second was fire-and-forget and its failure invisible. Now the caller awaits every
write and reports failures, and an identical consecutive note is not re-appended.

### Gates: two hard on an order, one hard on an interaction

`kamOrderGateErrors` blocks exactly what §5.2 writes the word "Requires"
against — an Enq ID on `PI Shared`, a lost reason on `Lost`. Note this differs
from the Outreach board, which soft-gates the Enq ID: that PRD only says the
value is auto-fetched, this one says *requires*. Hard-gate what a document
names as required, and no more.

`interactionGateErrors` hard-blocks a next follow-up date on a logged **Call**,
because §4.1 says one "is required … before it can be saved". Scoped to a call,
which is the word the document uses; a meeting is prompted instead, since a site
visit ending in "we'll call when the drawings land" has no honest date to give.

### §4.3's "actioned" needs no new field

A follow-up is actioned when a LATER interaction is logged, because
`nextFollowUp` reads the account's follow-up date off the **latest** entry
(deliberately not the earliest across the log — a follow-up set in March and
superseded in April is not still pending). So a queue row clears the moment the
KAM logs the call, and nothing is ticked off by hand. Verified live.

Open question #3 (a floor on the queue) is answered no — an old unactioned
follow-up sits there indefinitely, because dropping it is how an account goes
quiet with nobody deciding to let it. `queueAgeBand` marks the age instead.

### Calls are deduped per client per day

`callsLoggedOn` counts distinct client+day, not interactions. This is a target a
KAM is measured against, and the field apps in this stack have a documented
habit of writing one event several times. Two genuine calls to one client on one
day count once; the alternative is hitting the number by pressing Save twice.
§4.1's target is reported, never enforced (open question #2) — measured, not
policed.

### §6, and which §6.2 additions were built

§6.1's pipeline definition is applied to all three verticals, with the statuses
each one counted printed on screen. Two rupee figures per tile — the deal-ticket
`pipeline` and the reps' `estimatedPipeline` — **never summed**, because an
order at Quote Shared has no ticket yet and the estimate is the only number
there is.

§6.2 is flagged in the PRD "for review rather than assuming they're wanted", so
only the ones this module's own sections already promise were built: **Call
Compliance** (§4.1's target, measured), **Account Temperature distribution** and
**At-Risk Accounts** (§3.2 exists so a manager "can see at a glance which
accounts are cooling off"), plus the **KAM Funnel**, which is the shape §6
already asks for on the other two boards. The remaining six — Win Rate and
Average Sales Cycle beyond the funnel's own, Lost Reason Breakdown, Segment-wise
Revenue and New vs Repeat — are computed in `components/b2b/models/kam/`/`analytics.ts` but not
rendered, awaiting KK's decision.

The KAM funnel counts each order's CURRENT status ("standing here or beyond").
Nothing in this stack records when an order passed through a status it has since
left, so a true historical funnel cannot be built, and one that looked like it
could would be wrong. Orders with no status date are reported as **untimed**,
not counted into a range.

Open question #6 (does KAM Pipeline include orders still open from the original
handoff?) is answered by §6.1 itself — "split by source" means those belong to
whichever board raised them; counting them here would count one order twice.

Open question #5 (should objective signals feed Account Temperature?) — it stays
the KAM's judgement, and `temperatureMismatch` names the contradiction beside it
(a 9/10 on an account that has not ordered in three months, a 2/10 on one still
buying). Reported, never overridden.

### Verifying these two tabs without touching production

`pipeline='client'` writes and the KAM board's own upserts were served by an
in-browser shim during verification, with the Django host stubbed from a fixture
built on the REAL Enq IDs stored on the live KAM rows. Every `pipeline='kam'`
and `'inbound'` READ stayed live. Re-checked afterwards: 171 inbound / 30 kam
rows with their original stage strings / 0 client rows, unchanged. If you repeat
this, block non-client writes in the shim and re-query the table at the end —
`tx=rollback` will not save you here.
