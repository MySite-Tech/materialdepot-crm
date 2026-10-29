*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The KAM module: clients and orders are two things now

`components/b2b/models/kam/` implements `KAM_Module_PRD.docx` v1.0 (KK).
`components/b2b/views/kams/index.tsx` is the tab, rebuilt around it.

§7 says the module "shares its client universe with the Client Database", so an
assigned client IS a `ClientEntity` and §3's interactions live on that record.
This module owns exactly one stored thing: the **Active Order**, still the same
`pipeline='kam'` rows — 30 of them, live, split between two KAMs who are
actually using them.

Opening a client opens the shared Firm page (`components/b2b/drawers/firm/`,
see `client-db.md`). `views/kams/drawer.tsx` only adds the KAM-only sections:
calls and meetings, the KAM pipeline and escalations. So a number or GSTIN
added on either tab shows on the other, because both edit the same client row.

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
superseded in April is not still pending). So a firm leaves the Overdue tile the
moment the KAM logs the call, and nothing is ticked off by hand. Verified live.

Open question #3 (a floor on the queue) is answered no — an old unactioned
follow-up sits there indefinitely, because dropping it is how an account goes
quiet with nobody deciding to let it. `queueAgeBand` marks the age instead.

### The tiles are the navigation (2026-10-28)

Same design as Inbound (`inbound.md` §The tiles are the navigation), on the
shared `components/b2b/ui/lens-tiles.tsx`. Each tile is a lens. `firmLensMatches`
and `orderLensMatches` in `models/kam/cadence.ts` give both its count and its
list. On 2026-10-28 every tile matched its rows in a browser on real Supabase
data, with Django stubbed.

- **Follow-ups:** Overdue · Due today · No follow-up · Called today.
  **Accounts:** Assigned · Active · Inactive 1 month · Inactive (see §Account
  status). **Orders:** Open orders · Pipeline. Upcoming and Order board are
  pills. The four follow-up buckets
  partition the book: 9 + 2 + 44 + 11 = 66 firms on that day.
- **They replaced the `KAM_VIEWS` chips**, which listed the same four things as
  the tiles under different names and counts. The Assigned Clients chip counted
  `filteredRows` (after search) while its tile counted `rows`, so the two
  disagreed as soon as anyone searched (see the badge entry in
  `docs/landmines.md`). `todaysCalls`, `followUpQueue`, `CadenceList`,
  `CadenceRow` and `KamView` are deleted. The follow-up rule now lives in one
  helper, `firmFollowUp`, which `assignedClientRows` and `callCompliance` (and
  so the KAM dashboard) also read. `calledOn` does the same for calls.
- **Open orders and Pipeline are different sets on purpose.** Open is
  `KAM_OPEN_STATUSES`, which includes Requirement Logged. Pipeline is
  `KAM_PIPELINE_STATUSES` (Quote Shared and PI Shared), the §6.1 definition.
  Pipeline's tile shows the ticket value with the estimate beside it, never
  summed.
- **Overdue stays oldest-first** (§4.3 FIFO). Its age chip counts days past the
  follow-up date, the same number the old queue's `agedDays` showed, banded by
  `queueAgeBand`. It is not days since contact. Inactive 1 month sorts by
  `daysToLapse`, closest to 60 days first, and No follow-up puts the longest silence first. Assigned
  keeps the old order: overdue, then due, then the rest by silence.
- **Called today counts firms in scope**, so on "All KAMs" it now includes an
  unassigned firm someone called. `callsLoggedOn` itself is unchanged (one per
  firm per day, for that KAM).
- **Search reaches orders too**, by company, Enq ID and requirement, so the
  order tiles narrow with the firm tiles.
- **A failed read shows Unknown, never 0.** The client master failing blanks the
  firm tiles, and the order list failing blanks the order tiles, independently,
  each with a retry panel. Firms whose order metrics were not read reach neither
  any status tile (`clientStatus` gives Unknown), and the Assigned and
  Active tiles say how many.
- **Against the Django stub every firm reads Inactive with ₹0.** The stub
  answers `200 []` for `b2b-bulk`, so this says nothing about real accounts.

### Account status: 30 / 60 days, every firm (2026-10-29)

The user set this rule for KAM in the morning and, the same evening, asked for
it on **every firm**. So there is one rule again: `clientStatus`
(`models/client/rules/status.ts`), used by KAM, Client Database, the Dashboard
and Leadership. Client DB's old 3-month window and its "Lapsing soon" tile are
gone; its middle tile is now Inactive 1 month, the same set as KAM's.

`clientStatus` counts days since
`lastOrderPlaced`. **Active** is 0–30 days, **Inactive 1 month** is 31–60 days,
and **Inactive** is more than 60 days or no order on record. **Unknown** means
the history was not read. Checked at each boundary in Node.
`daysToLapse` gives the days left before a firm drops to the next bucket. It
drives the "Lapses in" column and the pill's "Nd left".

Everything KAM reads it: the tab's tiles, the Firm page opened from KAM (through
`statusScale`), and the B2B Dashboard's KAM section. That section's spoc split
and At-Risk Accounts panel now treats at-risk as **Inactive 1 month with no
follow-up or an overdue one**, counted in days to 60. It also feeds the
Leadership Board's KAM coverage denominator (`leadership.md`). The old At risk
tile is gone: it was "Active, within 30 days of the 3-month cutoff", and the
middle bucket replaced it. A future-dated `lastOrderPlaced`, from the b2b-bulk
bug, reads Active.

### No header actions (2026-10-29)

Export, Upload Orders and + Add Order were removed from the tab header at the
user's request. An order is now added only from a firm's page (`drawer.tsx`
`onAddOrder`), so every new order carries a `clientId`. The header button had
created orders with no client, which is what the board's "unlinked" count
reports. The CSV order importer (`views/kams/upload.tsx` and its validator in
`io/kam-import.ts`) went with it. That file keeps only the cell, phone and
delimiter parsing that the Client Database import still uses.

### Admin assigns firms, the KAM signs off (2026-10-29)

An admin selects firms in the Client Database (one or many) and assigns them to
a KAM, either by name or round robin. The KAM accepts, or rejects with a reason,
from the **Waiting for sign-off** tile here (`panels/signoff.tsx`).

- **The handover lives on the latest `assignments` entry**, as `status`,
  `how`, `kamPhone`, `respondedAt/By` and `rejectReason`. There is no new meta
  key. `assignments` is a real `b2b_client` jsonb column on the deployed
  backend. A new key would only persist once migration 0020's `extra` column
  ships, and until then it would be dropped silently. `firmHandover()` reads the
  latest entry only. **The Firm page's KAM picker goes through the same
  sign-off**: it is shown to managers only (`assignAs`), assigning there appends
  a `Pending` entry, and setting Unassigned appends one with no `status`, which
  ends any pending handover. Before this, any KAM could reassign a firm from
  its page and skip the sign-off entirely.
- **A pending firm already has `kam` set.** It counts in that KAM's book, tiles
  and coverage from the moment it is assigned, so a KAM cannot shrink their
  book by leaving it unanswered. Rejecting clears `kam`. The firm then lands in
  Client DB's **No KAM** lens, with "X rejected: reason" under the KAM column.
  Client DB also gets an **Awaiting KAM** tile while any firm is pending.
- **Round robin uses book size, not `fetchKamLoad`.** It picks the active,
  in-rotation KAM holding the fewest firms right now, ignoring the firms being
  moved, and ties go by name. `/kam-load` counts converted Inbound and Outreach
  leads. It answers a different question (who got the most new conversions), and
  it costs a request. Book size comes from the list already loaded.
- **Who may answer:** the KAM it was assigned to (phone, then name), a
  manager, or anyone while the team table is not live. The 48-hour window
  matches the Outreach handover (`HANDOVER_TAT_HOURS`). The tile counts those
  past it.
- **One bulk write.** An assignment is one `POST /rows/bulk` (`upsertClients`).
  On failure nothing is assigned and the error says so. A partial set never
  shows as done.

### Not built yet: the user's 2026-10-29 spec

- **A follow-up date and a closure date on every PI.** A firm has many PIs (one
  per order), and each needs both. A follow-up is stored per firm today (on the
  latest interaction), while `expectedClosure` is already on the order. Per-PI
  follow-up means a new field on `KamOrder`, saved into the live
  `pipeline='kam'` rows, and the follow-up tiles would count PIs, not firms.
  Check the row shape before writing.
- **Check-in before an offline visit (Outreach and KAM):** location permission,
  plus a photo in a Material Depot T-shirt with location on, taken before the
  meeting. `components/site-audit/apps/field/camera.tsx` already captures a
  photo with `navigator.geolocation`. Undecided: where photos are stored,
  whether a meeting may be saved without a check-in or is only flagged, and who
  reviews the T-shirt (software cannot).

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
(a 9/10 on an account that has not ordered in 60 days, a 2/10 on one still
buying). Reported, never overridden.

### Verifying these two tabs without touching production

`pipeline='client'` writes and the KAM board's own upserts were served by an
in-browser shim during verification, with the Django host stubbed from a fixture
built on the REAL Enq IDs stored on the live KAM rows. Every `pipeline='kam'`
and `'inbound'` READ stayed live. Re-checked afterwards: 171 inbound / 30 kam
rows with their original stage strings / 0 client rows, unchanged. If you repeat
this, block non-client writes in the shim and re-query the table at the end —
`tx=rollback` will not save you here.
