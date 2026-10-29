*Part of `docs/b2b/context.md` — see that file for the module overview.*

## B2B Inbound: the PRD, and the three systems that hold one lead

`components/b2b/models/inbound/` implements `Inbound_CRM_Module_PRD.docx` v1.0
(KK, Business Head – B2B) and is the ONE place that answers "where does this
field live?" for an inbound lead. Three systems hold pieces of the same lead:

| Holds | System | Reached via |
|---|---|---|
| Presales' capture (§3.1) | Kylas pipeline 31627 | `lib/api/` `kylasFetch` |
| Everything the Inbound team types (§3.2–3.5), its calls and its notes | `b2b_inbound_lead` (+ `extra` jsonb) on the FastAPI b2b-backend | `lib/b2b/data/` |
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
`Enquiry Invalid` became a lost reason at first, and since 2026-10-29 it is the
`Invalid` status (below). Nothing was deleted.

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

### One tab, three tile groups (2026-10-29, replacing Clients / PI / Results)

The user asked for one tab, "clean and easy", read as an ordinary pipeline. The
three sub-tabs from earlier the same day are gone, and with them the PI date
range bar and the PI-only lenses (Follow-up due, Converted, Dropped).

| Group (head) | Tiles | Rule |
|---|---|---|
| Call today | First call · Due today · Overdue · Ready to close | the day's work |
| Pipeline | Connected · Follow up · PI shared | one tile per open status |
| Outcomes | Sent to Outreach · Closed · Lost · Invalid | where leads ended up |

Arrived today, Upcoming, No follow-up date, Needs enrichment and All leads are
pills. One predicate (`lensMatches`) still gives each tile its count and its
rows, and lenses still overlap on purpose (a sent lead is open *and* an outcome).

- **PI follow-ups are back in Due today / Overdue.** A PI is a call to make like
  any other; the separate PI chase tile existed only because of the PI tab.
- **"Called" replaces "follow-up status" in the follow-up lenses.** An RNR no
  longer moves a lead off `New` (below), so Due/Overdue/Upcoming/No date cover
  every open lead with at least one logged call, `New` included. First call is
  `New` with **no** call.
- Tiles show "…" while loading and "Unknown" on a failed load, never 0, as before.

### The working day ends at 5 pm (2026-10-29)

`inboundWorkDay(leadCreatedAt)` (`utils/inbound.ts`) is the day a lead counts
for: its IST date, or the **next working day** if it arrived at or after 17:00,
or on a non-working day. Working days are Mon–Sat, six a week, confirmed by the user on 2026-10-29 (`NON_WORKING_WEEKDAYS`). An RNR on Saturday books Monday. A
lead that lands at 8 pm is tomorrow's first call: it is not in today's First
call (the tile's subtitle says "+N after 5 pm, for tomorrow"), and Arrived today
uses the same day. Kylas timestamps are untouched; only the counting moves.
Public holidays are not modelled.

### The call log (2026-10-29)

Calls are the B2B team's own record, stored in `call_attempts` and **no longer
written to Kylas**.

- **RNR is one click.** It saves at once, sets the follow-up to
  `nextWorkingDay(today)` and keeps the owner, so the same rep gets it on
  their next working day. It asks for no note and no date, and the lead's status
  does not change: an unanswered lead stays `New`.
- **Connected asks for minutes, the next follow-up date (optional time) and
  what was discussed** (`connectedCallErrors`, all required). A `New` lead moves
  to `Connected - Need nurturing`; moving it further is a status decision.
- **That call form is the only place a follow-up date is typed.** The Status
  card shows it read-only ("set from the call log"). There used to be a second
  input there, and the two could disagree. The board's drag modal still asks for
  one when a move needs it; it writes the same field.
- **No cap on attempts.** The 4-box strip and "Attempt n of 4" are gone. Four
  was always the minimum before closing a lead, never a maximum.
- **Duration is minutes, stored as `durationMin`.** The old path posted the
  number to Kylas with `durationType: minutes`, which Kylas ignored. Kylas stored
  it as seconds, so a 4-minute call showed as "0m 4s".
- **Every logged call and note carries the logged-in user as `by`/`author`.**
  Writing them to Kylas through the API key credited them to the key's owner
  ("Kousika K") and showed notes as written by Kylas. Team notes now live in the
  row's `notes`. Kylas's own call records and notes stay visible, read-only,
  inside the collapsed **From Presales** card, so Presales' history and ours
  never mix. Calls the CRM already wrote to Kylas before this change remain
  there under the key owner's name.

### Ready to close (2026-10-29)

`closureReadiness` decides when a lead may be closed for lack of response:

- **unreachable**: at least `READY_RNR_COUNT` (5) RNRs dated within the last
  `READY_WINDOW_DAYS` (7) days; or
- **stalled**: at least 7 days since its work day, at least
  `MIN_ATTEMPTS_BEFORE_CLOSE` (4) calls, still `New` or `Connected`, and not sent
  to Outreach.

It feeds the Ready to close tile, a banner in the call log with a one-click
"Mark Lost", and the Lost gate. **The two no-response reasons are refused unless
readiness says so, and every other lost reason needs a Connected call.** A
reason like "Price issue" can only come from someone who spoke to the client.
`Unreachable (4 attempts)` is no longer offered; old rows keep it and show it as
"previously recorded". The user also stated "4 calls before lost or junk";
Invalid still needs only one logged call, because one call is enough to prove a
wrong number.

### Invalid is a status, not a lost reason (2026-10-29)

Every inbound lead is called to qualify it, and the answer is either genuine or
invalid. Invalid was the lost reason `Enquiry invalid`, which counted junk
enquiries as lost sales. It is now its own status in Results. **It is the
strictest gate in the module.** `statusGateErrors` demands:

- **at least one logged call** — nobody marks a lead invalid without trying it.
  The drag modal cannot satisfy this, so it says to open the lead and log a call;
- a reason from `INBOUND_INVALID_REASONS`;
- a note of at least `INVALID_NOTE_MIN` (15) characters saying what was checked,
  so "na" does not pass.

Old data is read, never migrated, like everything else here. A `b2b_lead.stage`
of `Enquiry Invalid`, or `Lost` with `lost_reason` = `Enquiry invalid`, reads as
`Invalid`. Neither has a reason or a note, so the Invalid tile flags them as
"missing reason or note" rather than pretending they were qualified. `Invalid`
counts as dead (not open) in `analytics.ts` and as `lost` in the unified Leads
tab. `Enquiry invalid` is no longer offered as a lost reason.

### Client details, and Send to Outreach (2026-10-29)

The Client details card holds what Inbound fills for everyone after them:
company name, **primary person (name + mobile)**, any number of **additional
people**, GST, segment, priority, client type, lead type, **City** (the old
Location, still pincode-defaulted) and an optional office address. The primary
person is pre-filled from Kylas's contact name and number the first time the
drawer opens. They are stored as `primary_contact_*` and `additional_contacts`,
because Kylas's `contact_name` is a snapshot that every sync overwrites. Office
location is no longer an enrichment field; primary person and City are.

**Inbound pushes to Outreach; Outreach does not just read a pool.** The Outreach
card sends an `outreachReferral`. It needs a **Connected** call first, plus a
status other than New, Lost or Invalid. The form asks for the decision maker,
the project, the preferred meeting date (time optional), the **meeting location**,
"agreed to meet", and a **summary for Outreach**. The summary is pre-filled from
the Connected calls' notes. The meeting location replaced office location, which
was being asked twice. Old referrals carry `note` instead of `summary`, and both
readers fall back to it.

- **Test `sentToOutreach(l)` (`outreachReferral?.at`), never the object.** An
  `object`-kind meta field writes `{}` when empty and reads `{}` back.
- **The context travels.** `leadFromInbound` builds the Outreach row with the
  primary person as contact (the Kylas number as `altPhone` if it differs), the
  additional people as `contacts`, and `inboundContext(l)` as its `notes`: every
  Inbound call and team note, each labelled with who wrote it. The Outreach
  drawer's notes therefore open with the full Inbound history.
- **There is no KAM handoff in Inbound any more.** The block under Placed under
  and its auto-assign are gone. A client reaches a KAM only through Outreach's
  handover.
- There is no withdraw. Once Outreach accepts, the lead lives on the Outreach row
  (`OR-IN-<id>`), and Inbound's KPI credits it only after that acceptance.

### One SPoC per team (2026-10-29)

The drawer's first card, **People on this client**, shows four SPoCs, derived by
`clientSpocs` and never stored:

| SPoC | From |
|---|---|
| Inbound | the lead's Kylas owner |
| Outreach | the BM on the linked Outreach row (`intake.inboundLeadId`), with whether they accepted |
| KAM | that row's `handover.kam`, else its `kam` |
| EC | `assignedTo` on the newest deal ticket in an order status (`DEAL_ORDER_STATUSES`) on the client's numbers |

The Outreach row comes from the cached all-rows read, so it costs no extra
request when the board has just loaded. The backend's `client_master` has
`inbound_spoc`/`outbound_spoc`/`kam_spoc` columns. Nothing writes them yet.

### Enq ID is picked from the client's deal tickets

At PI Shared and Closed, the Status card lists the deal tickets on the Kylas
number and the primary person's number (at most two `fetchLeadDeals` calls). Each
shows its value, status, branch and BM, and clicking one sets the Enq ID and runs
the lookup. Typing an Enq ID is still possible, for a ticket raised on a number
the lead does not have. The separate Deal tickets card is gone.

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
- **The team and the assignment log live on the b2b-backend**
  (`/b2b/team`, `/b2b/assignments*`, `/b2b/inbound/worked`), not Supabase. Until
  backend migration 0020 is deployed the round robin skips and every lead stays
  with Hardi (`docs/backends.md`).

### Gates: the PRD's four, Invalid's three, nine soft

`statusGateErrors` blocks the four the PRD states — follow-up date on
`Follow up`, Enq ID **and** follow-up date on `PI Shared`, lost reason on `Lost`
— plus the Lost reason rule (Ready to close, above) and Invalid's call, reason
and note. Everything in §3.2/§3.3 is chased through `enrichmentGaps` and never blocks: the first
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
could see who was on a live PI.

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
