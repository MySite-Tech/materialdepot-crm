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

### The CRM owns a lead once it is imported (2026-11-03)

The user's rule, after reps lost work on 2 Nov: **a lead comes from Kylas once,
and from then on only the CRM changes it. Nothing is written to Kylas.** Before
this, the board was one Kylas page of 25 plus every CRM row, merged on every
load. Three things followed from that, all seen on production data that day:

- **568 of 1,394 Kylas inbound leads had no CRM row**, so they existed only on
  whichever page of 25 "Load more" had reached. First call went 18 → 54 as the
  user paged, and "Sync from Kylas" re-read page 0 and dropped the rest, which
  read as a reset. "1390 unactioned in Kylas" was every lead in the two stages,
  826 of them already worked.
- **Kylas moved worked leads back to Hardi outside the CRM**, and the board filed
  each lead under its Kylas owner, so the lead left the rep's list with the
  rep's work on it. Lead 56581783 had a Connected call, a note
  and a follow-up from Vikas at 18:16 IST, and Kylas owned it as Hardi at 19:00.
  Three more of Vikas's leads went the same way, 4–10s after his CRM save. The
  assignment log holds no move back. The cause is unproven. User 71926 is the
  API key and stamps 1,378 of 1,394 leads, so who made the change can't be told
  apart. The suspect was the Requirement/Selection PATCH on Save re-firing a
  Kylas workflow.
- **Every save replaced the whole row from the browser's copy** (see below).

Kylas is now read in exactly two places:

- **The import.** `importInbound` (`lib/server/b2b-inbound/`) searches the two
  inbound stages, sorted by `updatedAt` desc, 500 a page. It inserts rows only
  for lead ids the CRM does not have, through `/rows/bulk` with `only_new`, so it
  cannot touch an existing row. A routine run stops at the first page with
  nothing new, normally 1 Kylas call. "Sync from Kylas" runs it with `full`,
  every page, 3 calls for the ~1,400 leads. It runs inside `POST
  /api/b2b/inbound/assign {mode:'sync'}`, followed by the round robin, when
  Inbound opens and every 5 minutes after (`useInboundSync`). The first full run
  on real data imported 565 rows in 2s and changed none of the 1,049 existing
  ones. It takes only leads **created** after `B2B_FRESH_START`. A lead created
  earlier and qualified later is inserted by the round robin instead
  (§Who owns a lead, the pool).
- **A search.** `fetchInboundBoard` with a search term also runs the widened
  Kylas search (§Search deliberately reaches outside the board) and appends
  leads that are not imported. Saving one inserts its row.

**The board is the CRM rows and nothing else.** No paging against Kylas, no
merge. Date, owner, stage tag and search filter `rowToInbound` output in memory.
**Only a search reaches the network (2026-11-05).** Owner, Mine / All, Kylas stage
tag and lead date run in memory through `inboundBoardMatches`, the same predicate
`fetchInboundBoard` applies, so changing them sends nothing. Before, each change
re-read all of `/rows` (3.2 MB) once the 8 s cache had expired, and an older
answer arriving late replaced the newer one. A search re-reads, keyed on
`JSON.stringify(serverOpts)`, and only the newest load is applied (`latestLoad`).
Checked on the sandbox: scope plus three date changes sent no `/rows` read.
Two side effects: Add lead's duplicate check and bulk round robin's load count
now see every inbound lead, not only the filtered ones.
**There is no created-date floor on the rows (2026-11-05).** The import already
floors what it inserts, and on 5 Nov no row was older than `B2B_FRESH_START`
except the re-qualified leads the round robin inserts, which the floor hid.
`total` is the count at New, which `analytics.ts` reads as the inbound "New"
figure. The drawer's Kylas detail read fills only empty fields
(`useInboundDetail`). Its Presales calls and notes are still read live and
read-only.

**A save sends a change, not a row.** `/rows` upserts every column, `extra`
included, so the old whole-row write let a stale copy erase newer work. On
lead 56525199, the round robin sent the lead to Vikas at 10:49 IST. At
16:42 a reassign plus a save wrote a copy that still showed Hardi as owner,
New, with no calls. Nothing keeps history, so what it overwrote is unknown.
Now `saveInboundLead(base, next)` sends `inboundChange(base, next)`: the
top-level and `meta_data` fields that differ, and **only the added items** of
`call_attempts`, `notes` and `requirement_history`. `POST
/api/b2b/inbound/save` passes it to b2b-backend's `POST /rows/{id}/change`
(b2b-backend PR #20). That route locks the row, applies the change and adds to the
lists in one transaction. Ten parallel call appends all survived. It answers 404
"No such row" for a lead with no row, and the route then inserts the browser's
copy. **Until #20 deploys**, the 404 for the missing route makes `writeInbound`
read all of `/rows` (2.3 MB), apply the change with `applyInboundChange` (the
same rules) and write the row back, one write at a time per server process. Two
saves on different server instances inside the same second can still race on
that path. Both paths were run against real rows on 2026-11-03.

**The owner is the row's `owner_kylas_id`.** The round robin and reassign write it
to the row (`writeInbound` + `ownerChange`) and log the assignment. Neither
calls Kylas. The intake pool is still read from Kylas (owner 81181, qualified in
the window), which now never changes. The assignment log keeps a lead from being
dealt twice. The switch-over set each row's owner once with
`scripts/inbound-owner-cutover.mjs`: the latest assignment-log entry if there is
one, otherwise Kylas's owner at that moment. The row's name comes from the team
list, the legacy six, then Kylas's user list. Its first local run kept the old
name when the new owner was outside the team, which put "Mandeep" on three user
ids and broke Leadership's row keys. Fixed the same day. That matches what reps already
saw, except 14 leads Kylas had taken back to Hardi (11 to Vikas, 3 to Vilok).
On the local copy it changed 140 rows, mostly stored owners that disagreed with
Kylas. **Production still needs this run once, at deploy:** the log comes from
`select distinct on (lead_id) lead_id, to_kylas_id from b2b_lead_assignment
order by lead_id, at desc, id desc` (Metabase db 38), as a `{lead_id: to}` JSON
file. Dry-run it first.

### The lead window keeps unsaved work (2026-11-03)

Calls and notes save the moment they are logged. Everything else waits for Save
changes, and until 2026-11-03 three things threw it away without a word: Close,
a click on the backdrop, and a board reload that dropped the lead from the
list. The round robin reloads the board whenever it deals a lead, and the
user's screenshot showed "1 new lead shared out round robin just now" with a
lead open. Now:

- **Close, ×, the backdrop and leaving the page ask first** when there are
  unsaved edits: "Your changes to this lead are not saved yet", with Keep editing
  or Discard changes. `hasTeamEdits` decides, comparing team fields only, so
  Kylas detail filled in on open does not count as an edit (the `clean` ref in
  the drawer).
- **The open lead is held by the view (`opened`), not looked up in the list**, so
  a reload, a filter change or an owner change cannot unmount it. It is keyed on
  the lead id.

**Newest-first is applied in the view.** `byNewestLeadFirst` runs on `filtered`
in `views/inbound/index.tsx`, so every rendered list is date-ordered.
Leads with no `leadCreatedAt` sort last rather than to the top, which is what
comparing empty strings the other way round would have done. The call lists
(Call today, Overdue, Due today, Upcoming, PI Shared) are deliberately **not**
date-ordered: `sortForLens` sorts them by priority, then follow-up date.

**No export (2026-10-29).** The user removed the CSV/Excel export from this tab
for every role, admins included, as a security decision. Do not restore it
behind a role check.

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

### The working day ends at 7 pm (5 pm until 2026-10-30)

`inboundWorkDay(leadCreatedAt)` (`utils/inbound.ts`) is the day a lead counts
for: its IST date, or the **next working day** if it arrived at or after 19:00 (`INBOUND_DAY_CUTOFF_HOUR`; the user moved it from 17:00 on 2026-10-30),
or on a non-working day. Working days are Mon–Sat, six a week, confirmed by the user on 2026-10-29 (`NON_WORKING_WEEKDAYS`). An RNR on Saturday books Monday. A
lead that lands at 8 pm is tomorrow's first call: it is not in today's First
call (the tile's subtitle says "+N after 7 pm, for tomorrow"), and Arrived today
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


- **No follow-up time anywhere (2026-10-30).** The user said the time of a
  call is not needed, so the optional time beside every next-follow-up date is
  gone: the call log, the Move modal, the Outreach status card and the meeting
  editor. `followUpTime` is out of the types and both mappers, so
  `follow_up_time` is no longer read or written. Meeting times stay, because a
  meeting is an appointment.
- **Each call stores the caller's phone (`byPhone`, 2026-10-30)** as well as
  the name. Leadership credits a call by that phone first (`leadership.md`).
- **Reassigning a lead in the drawer saves the last saved copy** (`saved.current`),
  not the `lead` prop the drawer opened with. The prop has none of the calls
  logged since it opened, and the whole row is replaced on write, so reassigning
  a CRM-added lead used to delete those calls (`docs/landmines.md`).
### Ready to close (2026-10-29)

`closureReadiness` decides when a lead may be closed for lack of response:

- **unreachable**: at least `READY_RNR_COUNT` (5) RNRs dated within the last
  `READY_WINDOW_DAYS` (7) days; or
- **stalled**: at least 7 days since its work day, at least
  `MIN_ATTEMPTS_BEFORE_CLOSE` (5) calls, still `New` or `Connected`, and not sent
  to Outreach.

It feeds the Ready to close tile, a banner in the call log with a one-click
"Mark Lost", and the Lost gate. **The two no-response reasons are refused unless
readiness says so, and every other lost reason needs a Connected call.** A
reason like "Price issue" can only come from someone who spoke to the client.
`Unreachable (4 attempts)` is no longer offered; old rows keep it and show it as
"previously recorded". The requirement keeps its earlier versions
(`data-layer.md` §Requirement history). **Confirmed by the user on 2026-10-29:** 5 calls before
a lead closes as no progress (it was 4), and Invalid needs only one logged call,
because one call is enough to prove a wrong number. Calls and notes are never
written to Kylas, also confirmed that day.

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

**Each person has a designation (2026-10-30).** The primary person and every
additional person at the firm carry a designation (`primaryContactRole`, and
`role` on each `additionalContacts` entry), from the same suggestion list
Outreach uses. Both go across to Outreach on hand-off. Before this the extra
people went across with an empty role, which Outreach's capture gate then
refused to save. A Closed lead's revenue can be credited to someone other than
the owner by a manager (`leadership.md`). A lead can be sent to an EC from its
drawer (`ec-directed.md`).

**An End Consumer is not asked for firm fields (2026-10-30).** Company name,
primary person, GST and segment carry `firmOnly` in `ENRICHMENT_CHECKS`, and
`enrichmentGaps` skips them when the client type is End Consumer. So a home
owner no longer sits in Needs enrichment, and the drawer header counts 6
fields for them, not 10. The CRM-adherence KPI (`performance/teams/inbound.ts`)
waives firm name and segment by the same `isEndConsumer`. Contractor, Others
and the rest are asked for everything. A lead with no client type yet is asked
for everything too, because client type is itself the first gap.

**Inbound pushes to Outreach; Outreach does not just read a pool.** The Outreach
card sends an `outreachReferral`. It needs a **Connected** call first, plus a
status other than New, Lost or Invalid. The form asks for the decision maker,
the preferred meeting date (time optional), the **meeting location**,
"agreed to meet", and a **summary for Outreach**. The summary is pre-filled from
the Connected calls' notes. The meeting location replaced office location, which
was being asked twice. Old referrals carry `note` instead of `summary`, and both
readers fall back to it. **Active / upcoming project was dropped from this form
on 2026-10-30** at the user's request. Old referrals still show theirs, and
the Outreach brief prints it only when present.

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
`inbound_spoc`/`outbound_spoc`/`kam_spoc` columns. Nothing writes them yet. The
firm-level version of this card is `client-db.md` §Four SPoCs on every firm.

### Enq ID is picked from the client's deal tickets

At PI Shared and Closed, the Status card lists the deal tickets on **every
number on the lead**: the Kylas number, the primary person's and each added
person's (`inboundPhones`, one memoised `fetchLeadDeals` per number through
`fetchFirmDeals`, 2026-11-06). Each
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
filter still wins over the widening. Neither a search nor the board applies the
`B2B_FRESH_START` created-date floor any more. A search dropped it first, after a
B2B lead created in March was unfindable by its own phone number (2026-10-16),
and the board dropped it on 2026-11-05. A user-picked "Lead date from" still applies. A lead owned by nobody the board
knows maps to `owner: 'Unassigned'`. That means no team member or legacy owner
has that Kylas id, not that Kylas left the lead unassigned.

### Leads added in the CRM, outside Kylas (2026-10-30)

**+ Add lead** on the Inbound header is for a lead that reached us some other
way (WhatsApp, referral, walk-in, a direct call…). The user decided:

- **CRM only, never Kylas.** This follows the no-Kylas-writes decision. The lead
  is a `b2b_inbound_lead` row and nothing else.
- **The owner is whoever adds it.** A manager picks from the active inbound
  members who have a linked Kylas user. Ownership still means `ownerId` =
  that member's Kylas user id, so Mine vs All and the board filter work
  unchanged.
- **Required fields:** contact name, 10-digit mobile, company, where it came
  from (`INBOUND_ADD_SOURCES`) and the requirement. Selection is optional.
- **Duplicates are refused.** The modal first checks the loaded leads, then runs
  one board search by phone across Kylas and the CRM. If the search fails,
  nothing is added.

How it works without Kylas:

- **The id is `crm-…`, and `kylas_lead_id` holds the same `crm-…` value.**
  The backend's inbound upsert conflicts on `kylas_lead_id`, and a NULL there
  never conflicts. So a NULL would let the first save insert the row and make
  every later save fail on the primary key. Reusing the id keeps the existing
  route working with no backend change. `isCrmAddedLead` (the prefix) is the
  only test. Never read `kylas_lead_id` as "this is in Kylas".
- **Every Kylas read is skipped for these leads**: the Presales detail, notes and
  call logs (the drawer shows an "Added in the CRM" card instead). Since
  2026-11-03 nothing writes to Kylas for any lead, so save and reassign treat
  these the same as imported leads.
- The list and board tag them **CRM**.

Verified 2026-10-30 in `npm run dev:sandbox`: add, the required-field errors,
the duplicate refusal, Save (no Kylas warning), reassign (owner and
`owner_kylas_id` updated on the row, assignment logged), the manager's owner
picker, 390px. No request carrying a `crm-` id left for anywhere but the
backend.

### Who owns a lead: the team table, round robin, and Mine vs All

Built 2026-10-28; the design is in `sales-tab-redesign.md` §Inbound. **Inbound
ownership is the row's `owner_kylas_id` since 2026-11-03** (§The CRM owns a lead
once it is imported). It still holds a Kylas user id, because that is how a team
member is identified. The people who can hold it are the `inbound` rows of
`b2b_team_member`, which a B2B manager edits under the **Team** sub-tab. Nothing about who is on the team is hardcoded any more.

- **`B2B_INBOUND_OWNERS` is now only a fallback**, for display and for the
  board's owner set until managers have added everyone. The board's owner set
  is the legacy six **plus** every inbound member, so a lead held by someone not
  yet added (Mandeep, Praful…) does not vanish. Once the Team tab lists
  everyone, delete the constant.
- **Kylas delivers every Presales-qualified lead to Hardi (`81181`).** Verified
  2026-10-28: 245 of 245 leads in the two inbound stages over the previous two
  weeks, at 10–32 a day. Fixing that in Kylas was tried and did not work. The
  CRM therefore re-owns them, on the CRM row only. The `sync` mode of `POST
  /api/b2b/inbound/assign` imports and then rotates. `rotate` alone is the Team
  tab's Preview and Run.
- **The pool** = owner `81181`, the two inbound stages, **qualified** after
  `INBOUND_ROTATION_START` and within the last `INBOUND_ROTATION_WINDOW_DAYS`
  (7). Qualified means `expectedClosureOn`, which the Presales flow stamps along
  with "B2B Qualified" (80 of 80 Hardi leads had it on 2026-10-31). It was
  `createdAt` until then, and that stranded leads: leads are created under
  Kousika and qualified later, up to a year later, so 10 qualified since 29 Oct
  were never in the pool and sat with Hardi unworked. The log check reads the
  whole log for the same reason. From that it drops leads with any `b2b_lead_assignment` row, and leads
  Hardi already worked (a `b2b_lead` row past `New`). **Hardi is also a
  rotation member**, so "owned by Hardi" cannot mean "unassigned". The
  assignment row is what tells the two apart.
- **The pool can hold leads the import never brought in (2026-11-05).** The import
  goes by creation date, the pool by qualification date, so a lead created before
  `B2B_FRESH_START` and qualified this week has no row. On 5 Nov that was 5 of 101.
  Each one failed with "Not imported into the CRM yet" on every run. The pool
  now reads the full lead (`B2B_INBOUND_FIELDS`), and each owner write carries a
  `fallback` row built from it by `inboundRowFromKylas`, the import's own mapper.
  `writeInbound` inserts that row, with the new owner, when the backend answers
  "No such row". Checked on 39971691 and 49515900 from the real pool: both map to
  an inbound `New` row that reads back under the new owner. The write itself has
  not run on production.
- **The race guard is the partial unique index** on `lead_id` where
  `kind = 'round_robin'`. Every Inbound tab open runs the rotation, so two reps
  opening it together both plan the same leads; the second insert gets `23505`
  and skips that lead. Claims are written first, then one bulk owner write. If
  the write fails, its claim is deleted, so it is retried on the next run. A lead
  with no row is inserted, not skipped (the bullet above).
- **Order** = active, in-rotation, Kylas-linked inbound members, sorted by name,
  continuing after whoever got the last `round_robin` row (`planRotation`).
  "Paused" is how a manager takes someone out for the day. A paused person can
  still *receive* a manual reassign.
- **It repeats (2026-10-31).** `useInboundSync` runs on open and then every
  5 minutes while a tab is visible, so a failed run recovers without a reload.
  A run that imports or assigns reloads the board quietly, without the spinner,
  and the open lead stays open (§The lead window keeps unsaved work).
- **Hardi's share is half, not everything, and Kylas still delivers to Hardi.**
  Hardi is a rotation member, so with Vikas every second lead stays put. On
  2026-10-31 the log held 75 leads: Hardi 39, Vikas 19, Vilok 17. That excess
  over an even split fits 429s: a lead for Hardi needs no PATCH and always
  sticks, while a PATCH for anyone else failed and was released. Inferred, since
  production has no route listing each row's `to_kylas_id`. Stopping the batch on
  `KylasBusy` removes it. Vilok was `in_rotation: false` that day; a manager
  changes that under Team.
- **A Kylas 429 only delays a run (2026-10-31).** The import and the pool read
  wait out the limit (`docs/api-layer/context.md`). If Kylas still refuses, the
  run fails and the next one picks it up. Reassign no longer touches Kylas, so
  a 429 cannot stop it.
- **Mine vs All is in the fetch.** A rep linked to Kylas gets `ownerId` = their
  own id, and the owner filter is hidden. **"All inbound" is for managers and
  B2B admins only (2026-10-29).** It used to be one click away for every rep,
  for covering an absent colleague, and the user ruled that out: a rep sees
  only their own leads. A rep who is not an active Inbound member with a
  linked Kylas user is shown **no** leads and an amber notice naming the fix
  (B2B → Team). Before this they fell through to every owner's leads. This is
  still a screen filter, not confidentiality: the Kylas key is in the browser.
  Filtering on the server is the planned next step.
- **Reassign** (the drawer's Owner card) is open to any active inbound member or
  manager. The route re-checks that rule, refuses a lead with no CRM row, and
  writes the owner onto the row server-side. It logs `kind = 'reassign'` with a
  reason and `from_kylas_id` = the row's previous owner. The browser does not
  write the row.
- **A move made inside Kylas no longer reaches the CRM.** Before 2026-11-03 the
  board followed Kylas's owner (112 of 998 rows disagreed with Kylas on 2 Nov,
  54 of them Mandeep's leads moved to Hardi in Kylas). If someone moves a lead
  in Kylas on purpose, the move has to be repeated in the CRM.
- **The owner filter is also applied in the browser.** The list holds one owner's
  fetch, so `filtered` drops a lead the moment its `ownerId` stops matching.
- **The list has checkboxes for multi-select reassign (2026-11-02).** The user asked
  for this, so on this tab bulk takes **owned** leads, unlike Leads and Client
  Database. Same `AssignBar`, same access as the drawer, `useInboundReassign`.
  Open leads only, 25 at a time, list view only. Picks clear on any filter or lens
  change, so nothing hidden moves. Failed leads stay ticked for a retry.
- **`CallAttempt.by` is the logged-in user, not the lead's owner.** It was
  `draft.owner`, which would have credited every call on a reassigned lead to
  its new owner. Calls are an Effort KPI and belong to whoever dialled.
- **The team and the assignment log live on the b2b-backend**
  (`/b2b/team`, `/b2b/assignments*`, `/b2b/inbound/worked`), not Supabase. Until
  backend migration 0020 is deployed the round robin skips and every lead stays
  with Hardi (`docs/backends.md`).

### Why leads still read as Hardi's after she was paused (2026-11-06)

The user paused Hardi in the round robin and still saw leads on her. Measured on
production that day (Metabase db 38):

- **The rotation honoured the pause.** From 2 Nov 05:20 UTC to 6 Nov 08:04 UTC
  every `round_robin` row went to Vikas (94 leads) and none to Hardi. At 08:04
  her switch was turned back on from the Team tab, and she got one lead at 08:08.
  Nothing showed who had changed it, so each Team row now prints "changed by …"
  with the time (`updated_by`, `updated_at`).
- **Kylas will always show Hardi.** It hands every qualified lead to the intake
  user, and the CRM has written nothing to Kylas since 2026-11-03. Anyone reading
  owners in Kylas sees Hardi on everything. The Team tab says so.
- **The real gap: 329 leads at New, never called and never dealt, owned by the
  intake id in the CRM** (by creation month: 33 Aug, 163 Sep, 133 Oct). The 3 Nov
  import inserts each lead under its Kylas owner, and the rotation only deals
  what Kylas's own pool query returns: owner 81181, qualified in the last 7
  days. A lead that query misses keeps the intake owner forever, whatever the
  switch says.

Fixed in `rotateInbound`: the pool also takes **CRM rows held by the intake id,
at New, with no call and no assignment-log row** (`untouchedOnIntake`). Those
created after `INBOUND_ROTATION_START` are dealt on every run like the Kylas
pool. Older ones are the backlog: counted (`RotationOutcome.backlog`), shown on
the Team tab, and dealt only when a manager clicks "Deal N", 50 at a time
(`INBOUND_BACKLOG_BATCH`, manager-only in the route). Dumping 329 stale leads on
whoever is in rotation is the user's call, not an automatic step. Checked on the
sandbox: a 4 Nov row on the intake owner was dealt on the next run, a September
one waited as backlog until asked.

**A Team row save sends only what changed (2026-11-06).** It sent the whole
member from the page's copy, so a stale page could switch someone's round robin
back on while a manager changed their access. `saveMember` now reads the stored
row and fills whatever the request leaves out. The same shape as §A save sends a
change, not a row.

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

**Every number on the record counts as the client's (2026-11-06).** The user:
orders come in on any of a firm's numbers, so fetch them all. `lookupEnqId` takes
a list. Inbound passes `inboundPhones` (Kylas number, primary person, added
people), Outreach `outreachPhones` (number, alternate, contacts), the Leads tab
whichever of the two it holds, and KAM the order's number plus every contact on
its firm, in the order modal and in `resolveKamOrders`. `otherPhone` now means
"on a number not on this lead or firm", and the "did you mean" chips list the
Enq IDs on all of them. Client Database, the Firm page and KAM's firm metrics
already read every contact number (and the Firm page every GSTIN).

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
- `spok` is the active B2B team (`useB2BReps().everyone`), already loaded by the tab, so it costs no fetch.
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
  **Plywood is not one of them.** Selection is CRM-owned. Since 2026-11-03 it is
  never written back to Kylas. An import maps the six into the CRM once.
