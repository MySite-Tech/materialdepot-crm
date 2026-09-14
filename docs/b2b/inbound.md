*Part of `docs/b2b/context.md` — see that file for the module overview.*

## B2B Inbound: the PRD, and the three systems that hold one lead

`components/b2b/models/inbound/` implements `Inbound_CRM_Module_PRD.docx` v1.0
(KK, Business Head – B2B) and is the ONE place that answers "where does this
field live?" for an inbound lead. Three systems hold pieces of the same lead:

| Holds | System | Reached via |
|---|---|---|
| Presales' capture (§3.1) | Kylas pipeline 31627 | `lib/api/` `kylasFetch` |
| Everything the Inbound team types (§3.2–3.5) | `b2b_lead.meta_data` (CRM Supabase) | `lib/b2b/data/` |
| Cart / PI / order **value** | Django deal tickets, `/crm/leads/` | `fetchCRMLeads` |

Every field declares its `FieldOwner`, which is what the drawer's provenance
chips render. **No rupee figure is ever typed where the deal tickets own it** —
`expectedOrderValue` is explicitly the BM's estimate and is never summed as
revenue; `InboundLead.value` carries `orderValue` only, because `analytics.ts`
reads it as realised revenue.

### Kylas field names in this instance do not mean what they say

Verified against live leads 2026-09-08. `mapInboundLead` depends on all of this:

| Field | Actually holds |
|---|---|
| `city` | the urgency — "Immediate" / "Not sure" |
| `companyZipcode` | the qualification tag — "B2B Qualified" |
| `zipcode` | the real pincode, and the **only** thing that decides Bangalore vs Hyderabad |
| `cfSpaceRequirement` | PRD §3.1 "Lead Summary" (the enquiry type) |
| `cfPsOwner` | who in Presales qualified it |
| `cfMissedCallCount` | RNRs Presales already made, before our attempt 1–4 |
| `department` | a formatted mirror of `createdAt`; redundant, deliberately not requested |

**`expectedClosureOn` is junk and must not be mapped.** It is auto-stamped a few
minutes after the lead is created — median 14 minutes across 100 sampled leads,
45 of them inside 10 minutes. It was mirrored into `meta_data.expected_closure`
on all 151 rows, and because the old drawer auto-flipped the stage to `Followup
Required` whenever that field was set, **81 leads reached "Followup Required"
with a follow-up date on none of them.** `analytics.ts` now reads `followUpDate`
for the inbound half of its closure pipeline; the PRD defines no expected-closure
field for inbound.

**Neither `firstName` nor `lastName` can be trusted by position.** Lead 53329327
has the phone in `firstName` and a null `lastName`; lead 53197556 has a null
`firstName` and "Ashu" in `lastName`. `kylasLeadIdentity()` is the single reader
— the previous mapper read `firstName` only and used `lastName` as a *phone*
fallback. A "name" that is the phone number again is reported as **no name**,
which is what PRD §3.2's Client Company Name exists to fix.

### The nine old stages became four statuses plus three fields

`normalizeStatus` / `decomposeLegacyStage` run on every READ, so the board is
correct whether or not `b2b-migration-inbound-status.sql` is ever run. That is
deliberate — this repo has twice shipped a migration nobody ran. Two of the nine
were never statuses: `Hyderabad` (40 rows) was a **location**, confirmed against
`zipcode` (11 of 13 sampled were 50xxxx Telangana while every Followup Required
row was 56xxxx Karnataka), and `RNR` (13 rows) was a **call outcome**.
`Enquiry Invalid` became a lost reason. Nothing was deleted.

**`Connected - Need nurturing` is a fifth, added after the PRD** (Business Head
request, Sept 2026) for the lead that answered but has nothing live yet — before
it existed those sat in `Follow up` and were indistinguishable from a lead
working towards a quote. It sits between `New` and `Follow up`, and **it is not a
hard gate**: `statusGateErrors` still blocks exactly the four the PRD states, so
a rep can park a lead there without inventing a date. It counts as a follow-up
status everywhere else — `INBOUND_FOLLOW_UP_STATUSES` is what the Today view, the
overdue tiles and `analytics.ts`'s in-progress and live pipeline all read, so use
that constant rather than spelling the statuses out again. `b2b_lead.stage` is a plain `text` column with no check constraint, so no
migration was needed and old rows are untouched.

### `meta_data` is one field table, in both directions

`INBOUND_META` + `INBOUND_KYLAS_SNAPSHOT` in `lib/b2b/` drive read and write
from one declaration. Before this there were two hand-written object literals
and anything in only one of them was dropped on every save — which is what
happened to `calls` and `notes`, hardcoded to `[]` on read while the writer never
sent them.

**The old mapper persisted its own UI placeholders.** `meta_data.contact_name`
is the literal em-dash `'—'` on 150 of the 151 live rows, because
`mapInboundLead` used `firstName || '—'` and the writer stored whatever it was
handed. `PERSISTED_PLACEHOLDERS` reads those as empty. Do not add a display
fallback anywhere upstream of a write.

Kylas owns §3.1 outright, so `mergeKylasIntoRow` **replaces** those fields on
every sync — a stored snapshot must never win over Presales, or a reassigned
lead keeps showing the old BM forever. `requirement` is the exception: shared,
and a local edit not yet pushed wins.

**The overlay runs on every page and every filter; only the *prepend* is
page-0.** `fetchInboundBoard` used to skip the Supabase read entirely unless
`page === 0 && !kylasStage`, so page 2+ and any Kylas-stage filter showed raw
Kylas — your team's stage, follow-up, order value and notes silently absent on a
board that looked normal. Fixed 2026-09-10: the read and `mergeKylasIntoRow`
always run, and those two paths return the overlaid Kylas list early.

Page 0 keeps its original assembly — `[...dbLeads, ...kylasNotInDb]`, with
db-only rows still at `New` dropped. That ordering is load-bearing: **an edited
lead sorts above an untouched one in its column**, because "has a Supabase row"
is doing double duty as a sort key. A rewrite that maps over `kylas.leads` to
overlay in place is cleaner and loses that grouping — it was tried and reverted
the same day.

**Newest-first is applied in the view, not in that assembly.** The board, the
list and the export all want the latest lead at the top, and the obvious place to
sort is the fetch — which is exactly the rewrite above that was reverted. So
`byNewestLeadFirst` runs on `filtered` in `views/inbound/index.tsx` instead: the
data layer's grouping stays intact and every rendered list is still date-ordered.
Leads with no `leadCreatedAt` sort last rather than to the top, which is what
comparing empty strings the other way round would have done. The Today table is
deliberately **not** date-ordered — it is a call list, sorted by priority then
follow-up date.

**The Today grid's `minmax(0,1fr)` and `min-w-0` are load-bearing, not tidying.**
Its left track holds the call table, which is wide enough to need the
`overflow-x-auto` each bucket card already had — and that wrapper does nothing on
its own here, because a grid item's default `min-width: auto` will not shrink
below its content. Adding the Enq / Cart ID and Assisted at EC columns was enough
to grow the track past `<main>` and scroll the **whole tab** sideways under the
B2B sidebar, which reads as a broken layout rather than a wide table. Anything
scrollable added to either column needs the same treatment; see
`docs/landmines.md`. For the same reason a tile's value is `truncate`d and the
seven-tile row only goes seven-across at `2xl` — at `xl` each tile was ~146px,
and a long rupee figure has no space to wrap at.

### Search deliberately reaches outside the board

`b2bInboundRule` pins the board to two owners and two pipeline stages, which is
right for a call list and wrong for a search: a lead Presales parked elsewhere,
or one still sitting with its Presales owner, is invisible — "15 leads in Kylas,
only some of them here". So **while a search term is present the rule keeps only
`pipeline`**, dropping the stage restriction, and the owner restriction too
unless one owner was explicitly picked in the filter. An explicit Kylas-tag
filter still wins over the widening. A lead owned outside the inbound pair maps
to `owner: 'Unassigned'` — that is `B2B_INBOUND_OWNERS` having no name for that
id, not a claim that Kylas left it unassigned.

### Gates: four hard, eight soft

`statusGateErrors` blocks exactly the four the PRD states — follow-up date on
`Follow up`, Enq ID **and** follow-up date on `PI Shared`, lost reason on `Lost`.
Everything in §3.2/§3.3 is chased through `enrichmentGaps` and never blocks: all
eight were empty on all 151 live rows when this shipped, so a hard block would
just stop the board being used. Dragging a card into a gated column opens
`MoveModal` to collect the field rather than writing an incomplete status.

There is **no reminder service in this stack**. The follow-up date's reminder is
the Today view and the card badge. Do not word either as if a notification was
sent.

### Enq ID → order value

The PRD says the order value is "auto-fetched from Procurement using the Enq
ID". **There is no Procurement API here.** `lookupEnqId` resolves the id against
the deal tickets (a ticket's `id` *is* the cart/ENQ number) and takes `cartValue`
plus `assignedTo` for §3.5's "BM Name (from Procurement)".

**It resolves by enquiry id, not by phone — and that is the whole fix.** Until
Sept 2026 the lookup pulled every deal on the lead's *phone* and searched that
list, so a lead whose Kylas number differs from the number on the cart — a PA
raising the enquiry, a second line, a number corrected on one side only —
reported a perfectly valid Enq ID as invalid, and the rep typed the figure by
hand. `fetchLeadsByEnquiryId` now calls `/crm/leads/?enquiry_ids=`, which filters
on the indexed `estimate.lead_id` (with an `extra_data.cart_number` fallback) and
tolerates case variants server-side. The phone is used for one thing only: when
the matched ticket sits on a *different* number, `otherPhone` comes back and both
drawers say so, rather than binding another client's money silently.

Matching is still EXACT — `enquiry_ids=` is an `__in` lookup, never a prefix, so
`ENQ-2488` cannot resolve to `ENQ-24881`. A miss reports `no-match` with the Enq
IDs that *do* exist on the lead's number as "did you mean" chips; that suggestion
list is the only thing still keyed on the phone, it degrades to no suggestions
rather than to an error, and `fetchLeadsByPhone` has already memoised it for the
drawer's deal-ticket card, so it costs no extra request.

A Django outage returns `unavailable`, kept distinct from `no-match` so the UI
never tells a rep their correct Enq ID is invalid. **That was false for the first
three weeks it was written here**, and it is worth knowing why: `lookupEnqId`
fetched through `fetchLeadDeals`, which catches its own errors into `[]` — an
outage produced an empty list, which reads as "no ticket has that Enq ID", and
`unavailable` was unreachable code. Fixed 2026-09-08; `fetchLeadsByEnquiryId`
keeps the same shape, throwing rather than swallowing so the branch stays live.

### §3.5 is asked at PI Shared, not only at Closed

`InboundPlacedUnderCard` renders for **both** `PI Shared` and `Closed`. The same
four fields are behind one title per status — "Assisted by" while the PI is out,
"Placed under" once it is won (`PLACED_UNDER_TITLE`) — because they are the same
claim about who worked the lead, and asking for it only at Closed meant nobody
could see who was on a live PI. The KAM handoff block stays `Closed`-only: there
is nothing to hand over until there is an order.

All four are **dropdowns now, not free text**:

- `bmName` and `ecBmName` come from Django. `EcPicker` already loaded the EC list
  and the BMs at the chosen EC; `bmName` is the unscoped `fetchAvailableBMs()`,
  the same unbranched call the footfall and dashboard tabs already make.
- `spok` is `ASSIGNABLE_REPS` from `models/roster.ts`, not a fetch.
- **Every one of them keeps a stored value that the roster no longer lists.**
  These were free text for months, so live rows hold names and spellings no
  roster contains, and dropping one from the options would blank the field on the
  next save without anyone choosing to clear it. That is what `withStored` is
  for, in both the card and `EcPicker`.
- A roster that fails to load says so in the field hint and keeps the last list
  it had. It never renders as an empty dropdown — that reads as "no BMs exist".

Still true, and worth restating here because these are now pickers: **"Assisted
at EC" is never auto-filled** from the ticket's branch or assignee. A cart's
branch is where it was raised; "assisted at" is a claim about who helped close
it. `bmName` is the one exception, and only because `checkEnq` fills it from the
matched deal's own `assignedTo`.

### What the tiles count

`Pipeline value` is the sum over **open** leads (`INBOUND_OPEN_STATUSES` — every
status but `Closed` and `Lost`) and it keeps the two figures apart: the deal
ticket's `orderValue` where there is one, plus `expectedOrderValue` **only for
leads that have no ticket value yet**. The tile's subtitle names both. This is
the one place `expectedOrderValue` is added to a rupee total anywhere in the
module, and it is allowed here because the tile is explicitly a forecast — it is
still never summed as revenue, which is the rule the rest of this doc states.

### Two vocabularies that deliberately do not fully map

- **Client type.** Kylas `cfClientType` is its own picklist that Presales fills
  (Commercial owner 46, Architect/Designer 24, Home Owner 4, Builder 2 of 100
  sampled). Only unambiguous values are pre-filled — `Architect/Designer`
  collapses two distinct PRD values and `Commercial owner` has no PRD
  equivalent, so those stay blank with the Kylas value shown beside the field.
- **Selection.** The PRD has seven; Kylas's `cfCategoriesOfInterest` has six and
  **Plywood is not one of them.** Selection is CRM-owned, the six are mirrored
  back, and `selectionsKylasWillDrop` surfaces the rest in the UI rather than
  losing them silently.

`updateInboundLeadKylas` returns a result, not a boolean. The old drawer
discarded it, so a rejected PATCH rendered as a successful save and Kylas and the
CRM diverged with nothing on screen to say so.
