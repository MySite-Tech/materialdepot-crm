# components/b2b

**Covers:** `components/b2b/** · lib/b2b/** · lib/api/b2b/**`

## Purpose
B2B sales CRM: inbound leads, outreach, the leads tab, client database, KAM module, targets, leadership board and dashboard (~13.6k lines of components + 1.6k of domain/data).

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

## B2B Outreach: the field half, and why it is not "Outbound" any more

`components/b2b/models/outreach.ts` implements `B2B_Outreach_Module_PRD.docx`
v1.0 (KK) and is the counterpart of `components/b2b/models/inbound/` — the ONE place that
answers "where does this field live?" for an outreach lead. Only two systems
hold one, not three: `b2b_lead.meta_data` for everything the BM types, and the
Django deal tickets for the money. There is no Kylas leg, because nobody
qualified the lead before the BM walked into the room.

**The module is called Outreach everywhere a human reads it** (nav, headings,
the Leads tab's Source column, `B2B_VERTICALS`, the Leaderboard column) and
`'outbound'` everywhere a machine does. `b2b_lead.pipeline` is still
`'outbound'`: it is a stored enum whose allowed values are not tracked in this
repo, and this file already records that DB CHECK constraints here have to be
verified live. Renaming a column value to match a document's wording is not
worth a write that starts failing in production.

`b2b_lead` held **zero outreach rows** when this shipped (verified 2026-09-08:
181 rows, all `inbound` or `kam`), so the six-status vocabulary changed with no
data to migrate — `In Progress` → `Follow up`, `Samples/Catalogues Shared` →
`Quote Share`. `normalizeOutreachStatus` still decomposes the old two on READ,
for the same reason `normalizeStatus` does on the inbound side.

### The old board counted a typed guess as revenue

`OutboundLead` had a single `value` the BM typed on the create form
("Monthly order value"), and `analytics.ts` summed exactly that field as
realised revenue for every `Closed` lead. That is the bug the Inbound rollout
fixed, present again on the other board. Now: `expectedOrderValue` is the BM's
estimate and is read by nothing but the §6 Quote Shared tile (labelled as an
estimate on screen); `orderValue` comes from the deal ticket via `lookupEnqId`;
and `value` — the column analytics reads — is `orderValue || 0` in both the
mapper and every writer. **Do not put a typed figure into `value`.**

`outboundToRow` also dropped `expected_closure` on every write while
`rowToOutbound` read it, so an Expected date of closure typed into the drawer
vanished on save — and it is a column the Leads tab PRD asks for.
`OUTREACH_META` is now one declaration driving both directions, so a field
cannot exist on one side only.

### Gates: two hard, everything else asked for

`outreachGateErrors` blocks a next follow-up date on `Follow up` / `PI Shared`
and a lost reason on `Lost`. Two deliberate softenings, both because the PRD
does not name them:

- **Time.** The PRD says "date & time". Only the DATE blocks, so this board and
  the Inbound board gate identically — the same reps work both.
- **Enq ID on PI Shared.** The Inbound PRD names it required and hard-gates it;
  this one only says the value is auto-fetched. Soft here, prompted loudly:
  without it the fetch cannot run and the value stays blank, which is
  recoverable. `outreachStatusPrompts` carries these.

`MoveModal` opens for `Quote Share`, `PI Shared` and `Closed` too, even though
none of them has a hard gate — those are the three moves with something worth
collecting, and a silent move is how a status ends up with none of its fields.

### Meetings are a four-slot loop, not a visit counter

The old board had `visitCount: number`. The PRD wants meetings 1–4, each
`Completed` or `Postponed`, with location (area + office) and notes captured
**once a meeting is Completed** — the notes box only appears then. `Scheduled`
is a third state the PRD does not name and cannot be avoided: a booked meeting
is neither outcome, and storing it as either reports a meeting that never
happened (the same reasoning as Inbound's `New`). `meetingsExhausted` is the
diagram's "Meeting 4: Postponed" branch and only *offers* Lost or a long-term
park — it never decides.

### One KAM rotation, not two

`fetchKamLoad` counts closed leads across **both** lead pipelines.
`fetchInboundKamLoad` is now an alias of it. The Outreach PRD says its handoff
is "consistent with the Inbound module's handoff logic" and its open question #2
asks whether the pools are shared; two separate counts would each pick "the
least loaded KAM" by their own reckoning and both land on the same person, so a
shared count is the only reading under which "consistent" is true.

## The Leads tab: one row per lead, and three states in one column

`components/b2b/views/leads/index.tsx` + `fetchUnifiedLeads` implement
`Leads_Tab_PRD.docx` v1.0. The tab **captures nothing** — every row originates
in Inbound or Outreach — with one exception: "Assisted at EC", which the PRD
puts on this screen and which belongs to neither source form. It is written back
to whichever source row the lead came from (`outreach.ecName` /
`inbound.placedUnder.ecName`); this tab has no store of its own.

**EC is an Experience Centre, not an End Consumer.** The PRD asks for two
dropdowns; `EcPicker` binds them to `fetchBranchList()` (through
`apptBranchesFromCrm`, which drops HQ/warehouse and normalises the CRM's
"Yelankha") and `fetchAvailableBMs([ec])`. It follows this file's roster rules:
a non-array response throws, the last good roster survives a later failure, a
stored value not in the roster is kept as an extra option, and a failed load is
reported as *unreadable* rather than rendered as an empty dropdown.

Nothing auto-fills those two from the matched deal ticket. A cart's `branch` is
where it was raised and `assignedTo` is who owns it; "assisted at" is a claim
about who helped close it, and inferring one from the other puts a name in a
field nobody attested to.

Three PRD open questions are resolved in `fetchUnifiedLeads`, in code rather
than in JSX:

- **Lost leads stay listed** (open question #1). Status is the PRD's binary
  Closed / Yet to Close exactly as written, with a separate `lost` flag rendered
  beside it and filterable. Dropping them hides the outcome the business most
  wants to count; folding them into "Yet to Close" claims a dead lead is still
  being worked.
- **Expected date of closure has THREE states, not two.** Outreach has the
  field; Inbound does not and must not — Kylas `expectedClosureOn` is
  auto-stamped junk and is deliberately unmapped (see above). So the column
  renders a date, "not set", or `n/a`, carried by `hasExpectedClosureField`.
  Collapsing the third into the second reads as the Inbound team failing to fill
  a field that does not exist.
- **A half-loaded list says so.** Each side is caught separately into
  `failed: LeadSource[]` and the tab prints which one did not load. A Leads tab
  quietly showing only the Outreach half looks exactly like a CRM with no
  inbound leads.

Inbound contributes `fetchInboundBoard()` page 0 plus the whole DB overlay — the
same set the Inbound tab shows — so the footer states how many unactioned Kylas
leads are NOT in the list rather than implying the count is everything.

## The Client Database: one row per business, and nothing about an order stored

`components/b2b/models/client/` implements `Client_Database_Module_PRD.docx`
v1.0 (KK) and is the ONE place that answers "where does this field live?" for a
client ENTITY. `components/b2b/views/client-db/index.tsx` is the tab; `components/b2b/io/client-import/index.ts` is §7's bulk
upload.

Stored as `b2b_lead` rows with **`pipeline = 'client'`** — a new value for that
column. It has **no CHECK constraint**: verified 2026-09-08 by inserting a probe
row with `pipeline='client'` against the live project and deleting it by id.
Two things learned doing that, both worth knowing before the next probe:

- This Supabase does **not** honour `Prefer: tx=rollback`. The probe row
  persisted (201, then a plain `select` found it) and had to be deleted
  explicitly. Do not assume a "rollback" probe leaves no trace.
- `pipeline` being free text is what makes this module possible without a
  migration nobody runs — which this file already records happening twice.

Three of the four columns on a client row are deliberately inert, and the
reasons are the same reason:

| Column | Value | Why |
|---|---|---|
| `stage` | the constant `'Client'` | §2.1's Client Status is system-computed and "re-evaluates … on daily rollover". Storing it creates a second answer that can disagree with the orders it is derived from. |
| `value` | `0` | Total Revenue Generated is derived too, and a stored total has two independent ways to go stale: a new ticket, and a merge. |
| `owner` | the assigned KAM | The one meaningful column, matching what `pipeline='kam'` already does. |

### Every order figure is derived, from two different calls

Counts and values come from the batched `/crm/leads/client-order-history/`
endpoint — the same derivation the Leads tab uses, so a client row can never
disagree with the Leads tab about how much a client has spent. **That endpoint
returns no dates**, and §2's Last Order Placed (hence §2.1's Active/Inactive)
needs one, so the ticket list is also fetched per phone: one request each,
capped at `ORDER_DETAIL_PHONE_CAP` (120), pooled 4-wide, cached per phone, and
the overflow **reported in the UI**. Same pattern, same reasons, as the Site
Audit conversion funnel.

`clientMetricsFrom` keeps the two halves' failure states separate, and
`ClientOrderMetrics.dateState` is why: a client with real orders whose DATES did
not load is `Unknown`, never `Inactive`. Rendering an unread client as Inactive
would have a KAM stand down an account that is ordering every week. Verified
live: a phone whose Django call 500s renders `Unknown` / "unread", not `₹0`.

**The phone match is EXACT.** `?q=` is an `icontains` over a cast of
`client__contact`, so querying `9379787806` also returns tickets raised under
`919379787806123` — a different client. `fetchClientTickets` drops any row whose
contact does not normalise to the number asked for, and **counts the drops** in
the UI footnote. `fetchLeadDeals` gets away without this only because
`lookupEnqId` then matches the Enq ID exactly.

### Two columns §3.2 asks for do not exist

`CRMLeadRow` carries a client's PERSON name and **no GST at all**, so §3.2's
"Company Name captured on that specific order" and "GST Number used on that
specific order" are rendered as *"not in Procurement"*, not as blanks. A blank
cell there reads as "this order had no company name on it". Same rule for
§3.2's KAM column: it shows the account's KAM **today**, labelled as such,
because nothing in this stack records who held the account at the time.

### §2.1's window is anchored to TODAY, and the PRD does not quite say that

"Active: at least one order placed within the last 3 months, **measured from
Last Order Placed**." Read literally that is vacuous — the last order is always
within three months of itself, so every client who ever ordered would be Active
forever and the column would carry no information. The PRD's own next sentence
settles it: status "re-evaluates … on a daily rollover", and a daily rollover
only changes the answer if the window is anchored to today. So `clientStatus`
compares against `monthsBefore(today, 3)`. **Flagged for KK on screen**, not
silently chosen.

### There is no GST Validator in this stack

§3.1 wants each GST "fetched and validated via GST Validator, showing the
registered company name against it". There is no such API, credential or module
here. So `validateGst` does the half that works offline — the GSTIN shape, the
state code, and the **mod-36 check digit** (verified against the published
example `27AAPFU0939F1ZV`) — and `registeredName` exists on the record, is
rendered when present, and is explicitly reported as unavailable otherwise.

A failed SHAPE is refused. A failed CHECK DIGIT is stored with a warning
(`GstValidation.storable`), because that arithmetic is not regression-tested
against a corpus of real GSTINs and refusing a client's genuine GST would block
the upload this module exists to serve.

### Merge: the system never merges

§4 is a manual action and stays one. `findDuplicates` ranks pairs by evidence
and **always shows the evidence**: a shared phone, GST or PAN is exact-match
evidence; a matching normalised NAME is not evidence of identity and is offered
at the lowest confidence, never pre-selected, with that said on screen. Two
firms with similar names are not one client.

Open question #1 (whose Segment wins) is answered by asking: `mergeConflicts`
reports every field the sources disagree on and the Merge button stays disabled
until each is picked. No "most recent order wins" rule, because a segment chosen
by a machine changes how the account is targeted and nobody would know.

Order history needs no migration on merge — it was never stored. Retaining the
contact numbers **is** the rollup. The survivor is the OLDEST record's id, is
written FIRST, and only then are the absorbed rows deleted; a delete that fails
is reported ("merged, but N old records could not be deleted and will still show
as duplicates") rather than discovered on the next load.

### §7's dropdowns cannot be generated, and the door is guarded instead

The template asks for "dropdown validation on Segment and Client Type".
**SheetJS 0.18 does not write data validations** — `dataValidations` is a bare
comment in its sheet writer (`node_modules/xlsx/xlsx.js:15099`). So the generated
workbook ships Instructions + Template + a **Lists** sheet of the accepted
values, the Instructions sheet says why and how to point Excel's own Data
Validation at it, and — the part that matters — `validateClientRows` **rejects**
any Segment or Client Type off the list on import, naming the row. The dropdown
was a means of keeping bad values out; that end is met at the door.

### Open question #3: exact keys update, similar names do not

| Sheet row matches | What happens |
|---|---|
| a contact number or GST already on a client | that IS the same client — the row updates it, adding the contact/GST |
| `Merge With` naming an **exact** existing company name | merged into it |
| a near-miss `Merge With` | **rejected**, with the reason — "merge this into that" is the most destructive instruction the sheet can carry |
| a similar company name and nothing else | uploaded as a NEW client and reported for the Merge screen |

An update never replaces the existing record: `buildClient` adds contacts and
GSTs to it and never overwrites a curated name or label with whatever a bulk
sheet happened to carry, so an upload cannot wipe an account's interaction log,
KAM or canonical name.

### Seeding (open question #4)

"Is a Procurement export needed to seed Order Details?" No — Order Details is
derived from the deal tickets, which already hold every historical order. What
needs seeding is the ENTITY list, and `planClientSeed` proposes one from closed
Inbound leads, closed Outreach leads and the `pipeline='kam'` rows (24 distinct
phones live today). It never runs automatically, matches EXACTLY on the
normalised phone, and a candidate with no usable 10-digit number is reported as
unusable rather than created — nothing could ever link an order to it.

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
