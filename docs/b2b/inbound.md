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
status everywhere else — `INBOUND_FOLLOW_UP_STATUSES` is what the follow-up lenses and
`analytics.ts`'s in-progress and live pipeline all read, so use
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
comparing empty strings the other way round would have done. The call lists
(Call today, Overdue, Due today, Upcoming, PI Shared) are deliberately **not**
date-ordered: `sortForLens` sorts them by priority, then follow-up date.

### The tiles are the navigation (2026-10-28)

Each tile is a *lens*. One predicate, `lensMatches` in `views/inbound/utils.ts`,
decides both the tile's number and the rows listed under it, so a tile can never
count leads its list does not show (see the badge entry in `docs/landmines.md`).
On real data on 2026-10-28, all 13 lenses showed the same number on the tile as
rows in the table.

It replaced a Today view that reps found hard to navigate. That view had seven
static tiles, a follow-up table split into four collapsible buckets, side panels
for New and PI Shared, and a separate List view. A PI Shared lead appeared twice,
in the side panel and again in a bucket, because PI Shared is a follow-up status.
"New today" (27, created today) sat beside "New — not yet actioned" (15, status
New) with nothing explaining the difference. And no tile could be clicked.

- **The groups.** Call today, whose header is itself a lens and the default:
  First call · Overdue · Due today. Pipeline: Upcoming · PI Shared · Pipeline ₹.
  Outcome: Closed · Lost. Four secondary lenses sit as pills: All leads, Arrived
  today, No follow-up date, Needs enrichment. **Needs enrichment used to be a
  tile, and 896 of 897 leads matched it**, so as a headline it said nothing.
- **Lenses overlap on purpose.** PI Shared is a stage lens, and the same leads
  also land in Overdue, Due today or Upcoming by date. Only Call today's three
  parts are disjoint, since New is not a follow-up status, so its header is
  their sum.
- **Call today runs due today, then first calls, then overdue.** Overdue was 287
  on 2026-10-28. The old Today put it first, which buried the 13 new leads on
  page 12, against the KPI "New = 0 by end of day".
- **One table, paged at 25,** and it resets to page 1 when the lens or a filter
  changes. The Status column is hidden on single-status lenses. Deal becomes
  Lost reason on Lost. The Missing column appears only on Needs enrichment;
  before, its badge sat on 896 rows.
- **Today and List merged into one List view.** Board is unchanged, and clicking
  a tile from Board switches to List. Export's "Filtered" scope means the
  selected lens plus filters (on Board, filters only).
- **A search switches the lens to All leads.** The search reaches every stage and
  owner (next section), so any narrower lens would hide what it found. That was
  the old failure: a rep who searched a New lead's phone got an empty follow-up
  list.
- **Tiles show "…" while loading and "Unknown" if the fetch fails, never 0.** A
  failed load shows a retry panel instead of "Nothing to call today". The old
  tiles showed 0 throughout every load. "Fails" includes `ok: false` from
  `fetchInboundBoard`. Kylas used to fail silently into a board of DB rows only,
  with First call at "0 · all called" (see `docs/landmines.md`).
- **No follow-up date was 130 on 2026-10-28.** These are leads on a follow-up
  status that can never come up as due. Before, they sat in a bucket that
  started collapsed.
- While Kylas has more pages, the counts cover the loaded leads only, and the
  subtitle says so.

The table now sits in normal block flow rather than in the old
`grid-cols-[1fr_320px]`. The tile groups are a grid, and every section in it
carries `min-w-0`. If the table ever goes back inside a grid or flex track, that
track needs `min-w-0` too (see `docs/landmines.md`). Otherwise the whole tab
scrolls sideways under the B2B sidebar. Tile values are `truncate`d, and
subtitles are kept to about 20 characters because a tile is ~120px wide at
1280px. Checked at 1440, 1280 and 390.

### Search deliberately reaches outside the board

`b2bInboundRule` pins the board to two owners and two pipeline stages, which is
right for a call list and wrong for a search: a lead Presales parked elsewhere,
or one still sitting with its Presales owner, is invisible — "15 leads in Kylas,
only some of them here". So **while a search term is present the rule keeps only
`pipeline`**, dropping the stage restriction, and the owner restriction too
unless one owner was explicitly picked in the filter. An explicit Kylas-tag
filter still wins over the widening. A search also drops the `B2B_FRESH_START`
created-date floor (`fetchInboundBoard`), for Kylas and the DB rows alike — a
B2B lead created in March was unfindable by its own phone number (2026-10-16).
A user-picked "Lead date from" still applies. A lead owned by nobody the board
knows maps to `owner: 'Unassigned'`. That means no team member or legacy owner
has that Kylas id, not that Kylas left the lead unassigned.

### Who owns a lead: the team table, round robin, and Mine vs All

Built 2026-10-28; the design is in `sales-tab-redesign.md` §Inbound. **Inbound
ownership is the Kylas `ownerId`, and the people who can hold it are the
`inbound` rows of `b2b_team_member`**, which a B2B manager edits under the
**Team** sub-tab. Nothing about who is on the team is hardcoded any more.

- **`B2B_INBOUND_OWNERS` is now only a fallback**, for display and for the
  board's owner set until managers have added everyone. The board's owner set
  is the legacy six **plus** every inbound member, so a lead held by someone not
  yet added (Mandeep, Praful…) does not vanish. Once the Team tab lists
  everyone, delete the constant.
- **Kylas delivers every Presales-qualified lead to Hardi (`81181`).** Verified
  2026-10-28: 245 of 245 leads in the two inbound stages over the previous two
  weeks, at 10–32 a day. Fixing that in Kylas was tried and did not work. The
  CRM therefore re-owns them: `POST /api/b2b/inbound/assign {mode:'rotate'}`.
- **The pool** = owner `81181`, the two inbound stages, created after
  `INBOUND_ROTATION_START` and within the last `INBOUND_ROTATION_WINDOW_DAYS`
  (7). From that it drops leads with any `b2b_lead_assignment` row, and leads
  Hardi already worked (a `b2b_lead` row past `New`). **Hardi is also a
  rotation member**, so "owned by Hardi" cannot mean "unassigned". The
  assignment row is what tells the two apart.
- **The race guard is the partial unique index** on `lead_id` where
  `kind = 'round_robin'`. Every Inbound tab open runs the rotation, so two reps
  opening it together both plan the same leads; the second insert gets `23505`
  and skips that lead. The claim row is written before the Kylas PATCH, and
  deleted again if Kylas refuses, so a failed lead is retried on the next run.
- **Order** = active, in-rotation, Kylas-linked inbound members, sorted by name,
  continuing after whoever got the last `round_robin` row (`planRotation`).
  "Paused" is how a manager takes someone out for the day. A paused person can
  still *receive* a manual reassign.
- **The owner change is a JSON Patch on `/ownerId`**, and `setLeadOwner` then
  reads `ownerId` back. Not every API applies a write it accepts with a 200
  (see the "Success reported off an HTTP 200" landmine), so a mismatch counts as
  a failure. **This had not been exercised against a real lead as of
  2026-10-28**: the first real run is the verification.
- **Mine vs All is in the fetch.** A rep linked to Kylas gets `ownerId` = their
  own id, and the owner filter is hidden. "All inbound" is one click away for
  every inbound rep, deliberately, because a rep covering for an absent
  colleague needs it. Outreach and KAM will be hard-scoped instead. This is a
  focus aid, not confidentiality: the Kylas key is in the browser.
- **Reassign** (the drawer's Owner card) is open to any active inbound member or
  manager. The route re-checks that rule, refuses any lead outside the
  inbound pipeline, and logs `kind = 'reassign'` with a reason.
- **`CallAttempt.by` is the logged-in user, not the lead's owner.** It was
  `draft.owner`, which would have credited every call on a reassigned lead to
  its new owner. Calls are an Effort KPI and belong to whoever dialled.

### Gates: four hard, eight soft

`statusGateErrors` blocks exactly the four the PRD states — follow-up date on
`Follow up`, Enq ID **and** follow-up date on `PI Shared`, lost reason on `Lost`.
Everything in §3.2/§3.3 is chased through `enrichmentGaps` and never blocks: all
eight were empty on all 151 live rows when this shipped, so a hard block would
just stop the board being used. Dragging a card into a gated column opens
`MoveModal` to collect the field rather than writing an incomplete status.

There is **no reminder service in this stack**. The follow-up date's reminder is
the Due today and Overdue tiles and the card badge. Do not word either as if a notification was
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

The PATCH itself must be JSON Patch (`application/json-patch+json`, an array of
ops; custom fields under `/customFieldValues/<key>`). Kylas answers a plain JSON
object with 415, which is what every inbound save got until 2026-10-07.
