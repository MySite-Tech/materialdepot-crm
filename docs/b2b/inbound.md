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
ID". **There is no Procurement API here.** `lookupEnqId` matches the Enq ID
against the deal tickets already on the client's phone (a ticket's `id` *is* the
cart/ENQ number) and takes `cartValue` plus `assignedTo` for §3.5's "BM Name
(from Procurement)". Matching is EXACT — a near-miss reports `no-match` and the
rep types the figure, flagged `manual`, because resolving `ENQ-2488` to
`ENQ-24881` would attach one client's money to another's lead. A Django outage
returns `unavailable`, kept distinct from `no-match` so the UI never tells a rep
their correct Enq ID is invalid.

**That last sentence was false for the first three weeks it was written here**,
and it is worth knowing why. `lookupEnqId` fetched through `fetchLeadDeals`,
which catches its own errors into `[]` — so an outage produced an empty deal
list, which reads as "no ticket has that Enq ID", and `unavailable` was
unreachable code. Every rep would have been told their perfectly good Enquiry ID
was invalid for as long as Django was down. Fixed 2026-09-08 by calling
`fetchCRMLeads` directly with an `Array.isArray` guard, which is what the Site
Audit funnel module already did for exactly this reason. See the `Array.isArray`
section — a wrapper that swallows makes the error branch above it dead.

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
