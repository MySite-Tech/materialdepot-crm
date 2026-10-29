*Part of `docs/b2b/context.md` — see that file for the module overview.*

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

Since Sept 2026 `lookupEnqId` resolves by enquiry id rather than by phone (see
`docs/b2b/inbound.md`), so it is no longer the phone filter it was incidentally
acting as. Where a match must belong to *this* client — `resolveClientOrders` in
`lib/b2b/orders/details.ts` and the KAM order modal — the caller rejects a result
carrying `otherPhone`. Anywhere that check is dropped, a ticket raised on another
number attaches its money to this account.

### Two columns §3.2 asks for do not exist

`CRMLeadRow` carries a client's PERSON name and **no GST at all**, so §3.2's
"Company Name captured on that specific order" and "GST Number used on that
specific order" are **not rendered as columns at all** until some row carries
`companyOnOrder` / `gstOnOrder`. Until 2026-10-28 they were two columns of
*"not in Procurement"* on every row: honest, but it was most of what the user
called "texty". An absent column cannot be misread as "this order had no
company name"; a blank cell could, so never bring the column back with blanks
in it. The KAM shown on the Firm page is the account's KAM **today**. Nothing
in this stack records who held the account at the time.

### The Firm page: one drawer for Client DB and the KAM tab

`components/b2b/drawers/firm/` is the page `sales-tab-redesign.md` §KAM calls
"one Firm page, two lists". It replaced both Client DB's expanded row and the
old KAM drawer, which showed the same firm two ways. The KAM tab passes its
own sections (calls, KAM pipeline, escalations) as children. Things that are
not visible in the code's shape:

- **A number or GSTIN already on another firm is refused**, naming that firm
  and pointing at Merge. The upload rule above treats an exact key as *the same
  client*. Two firms sharing a phone would each count that phone's orders, so
  the list's revenue total would count them twice.
- **Per-number order counts read the bulk aggregates**, the same numbers
  `clientMetricsFrom` sums for the summary strip. They do not read the ticket
  list. That is why they always add up to the strip. The ticket list can
  disagree with the aggregates, and if the numbers came from it they would not.
- **Adding a number has to refetch that number's aggregate**
  (`useClientAggregates().addPhones`, one bulk call). Without it,
  `clientMetricsFrom` finds a phone with no `dates` entry and the firm turns
  **Unknown** until the tab reloads. It is already wired into both views'
  `saveClient`.
- Removing the primary number promotes the next one, so a firm is never left
  without one. Removal asks inline, never via `confirm()`.
- The list and the order tabs page at 25 rows. The tiles and the strip
  count the full filtered set.

### One enquiry, opened in place (2026-10-29)

Clicking an enquiry row on the Firm page expands it into everything Django
already returned on that ticket: cart lines, cart value with and without GST,
status, the created / follow-up / closure / lost dates, branch, assigned BM,
client type, property, project phase, architect involved, visits and remarks
(`cards/enquiry.tsx`). **It costs no request.** `/crm/leads/?q=<phone>` already
returns those fields, so `ticketToOrderRow` carries them instead of dropping
them. The remarks shown are the ones on the ticket. `/crm/lead-remarks/` is
not called, because `fetchLeadRemarks` swallows failures into `[]` and would
turn an outage into "no remarks".

- **`cartItems` arrives as a string or as `CartItem[]`** (the Sales CRM's leads
  table handles both). `String()` on the array gave "[object Object]", so
  `cartLines` reads either shape. A string is split on newlines only. A comma
  can be part of a product name.
- **"Open pipeline" is now labelled "Open carts".** The value is still the
  aggregates' `openValue`, and the order tab of that name counts the open
  tickets. No second figure was added, so the tile and the tab cannot
  disagree about anything new.
- The subtitle says "across all N numbers" because the list was always every
  number's tickets merged. The Via column shows that only once a firm has two
  numbers.

### GST: what can and cannot be linked

Tickets carry **no GSTIN**, and no Django endpoint filters by GST (`lib/api`
has none). So an enquiry billed to one of the firm's GSTINs, but raised on a
number that is not on the firm, cannot be found. The GST card says so in amber,
and names the ask: a `gst=` filter on `/crm/leads/`. Do not join GST to
enquiries by firm name or by PAN on the frontend. That is the name-merge
mistake §Parent companies rules out.

### Each number: classification and Studio Space access (2026-10-29)

Every contact on a firm carries a **classification** in its existing `label`
field (`CONTACT_CLASSES`: Owner, Partner, Designer, Purchase, Accounts, Site).
It is a select now. A free-text label from before is kept as an extra option,
not wiped. It also carries **`studioAccess`**: unset means not onboarded,
`power` means the whole Studio Space dashboard, and `non-power` means Orders
and Rewards only. `studioOnboardedAt` is stamped the first time it is set.
The user's call was **per phone, not per firm**. The older per-firm "Power user
/ Normal user" tier in `sales-tab-redesign.md` is superseded.

Both persist with no migration. `contacts` is its own jsonb column on
`b2b_client` in the deployed b2b-backend (`master`), and the mapper passes
unknown contact keys through. This was verified on the sandbox: the change
reached `.sandbox/state.json` through the normal `onSave`.

**It is a record, not a grant.** Studio Space's own access lives in
`partner_user.visible_tabs` in b2b-backend, where `NULL` means unrestricted.
Nothing writes that from here, and nothing reads it back. Making the marking
real needs a `/sync` endpoint keyed by phone. It is not built. The Studio Space
tab reads these fields; see `studio-space.md`.

### The list: tiles are lenses, filters narrow them (2026-10-28)

Same shape as Inbound and KAM, on `components/b2b/ui/lens-tiles.tsx`.
`clientLensMatches` (`views/client-db/utils.ts`) gives both a tile's count and
the list it opens. Tiles: All firms · Active · Lapsing soon · Inactive, then
No KAM, plus Unread only when some firm's orders did not load.

- **Why it changed.** The five tiles were `StatTile`s with no click handler, and
  a status dropdown did the tiles' job. The tiles counted the dropdown-filtered
  rows, so picking "Active" turned the Inactive tile to 0. The user reported
  this as "clicking Active/Inactive is not coming right".
- **Tiles count the search plus segment/type/KAM scope, never the lens.** So
  picking a tile cannot change another tile's number. The status dropdown and
  the KAM dropdown's "Unassigned" option are gone, because the tiles are those
  filters. Two controls for one predicate drift apart (the badge entry in
  `docs/landmines.md`).
- **Inactive 1 month replaced Lapsing soon (2026-10-29)**, when the 30/60 rule
  became every firm's. It is the same set as KAM's tile of that name.
- **Each lens has a default order** (`LENS_DEFAULT_SORT`): Lapsing puts the
  oldest last order first, which means fewest days left. No KAM sorts by
  revenue, and the rest by most recent order. A column header overrides it, and
  picking a tile resets it. Unread values sort last in both directions.
- **There is no export, for anyone (2026-10-29).** The user called client data
  export a security issue and removed it for admins too. Do not bring it back
  behind a role check. The upload modal's "Download log" stays: it lists only
  row numbers, company names and the outcome of the file the user uploaded.
- **A last-order date after today is flagged "future date"** in amber. The date
  is Django's `lastOrderDate`, and `clientStatus` still counts the firm as
  Active.
- **`b2b-bulk`'s `lastOrderDate` is wrong at the source — a Django bug, open.**
  On 2026-10-28 the top seven rows of the list all showed future dates
  (30 Oct 2026 to 10 Feb 2027). In Metabase (`materialdepot_azure`), no estimate
  has an `order_placed_time` after today, and each of those seven firms' real
  latest `order_placed_time` fell between 7 and 28 Oct 2026. Neither
  `expected_delivery_time`, `estimate_items.order_placed_time`,
  `estimate_payment_term.deadline`, `po.delivery_date` nor any `ticket.extra_data`
  key produces the served dates, so the endpoint reads something else — the
  hand-set look (month-ends) points at the deal's expected closure date, which
  is not in Metabase. Revenue only partly agrees too (one firm ₹7.5L served
  against ₹72.8L placed). The frontend passes the value through untouched; the
  fix is `max(order_placed_time)` over placed estimates in Django. Until then,
  Active/Inactive and the lens counts are unreliable for any firm with a deal
  open.

Verified 2026-10-28 in a browser with real Supabase reads, Supabase writes
aborted, and Django stubbed (`b2b-bulk` answered with synthetic per-phone
dates). For every tile, its count equalled its list's `Showing … of N`. All
equalled Active + Inactive (66 = 40 + 26). Segment 2 narrowed every tile
(29 / 17 / 12), and removing a chip reset its select. There was no horizontal
scroll at 390px and no page errors.

### Assigning firms to KAMs (managers only, 2026-10-29)

Managers get a checkbox column and an assign bar (`ui/assign-bar.tsx`, shared
with Outreach's pool). Picking a KAM or Round robin writes a pending handover
that the KAM signs off on the KAM tab. The rules (where the state is stored,
why it is book size and not `/kam-load`, what rejection does) are in `kam.md`
§Admin assigns firms. The checkbox column renders only when `picked` is passed,
so non-managers get the old table unchanged.

### §2.1's window is anchored to TODAY, and the PRD does not quite say that

**The window is 30 / 60 days since 2026-10-29** (`kam.md` §Account status), not
the PRD's 3 months: the user asked for KAM's rule on every firm. The anchoring
argument below still holds.

"Active: at least one order placed within the last 3 months, **measured from
Last Order Placed**." Read literally that is vacuous — the last order is always
within three months of itself, so every client who ever ordered would be Active
forever and the column would carry no information. The PRD's own next sentence
settles it: status "re-evaluates … on a daily rollover", and a daily rollover
only changes the answer if the window is anchored to today. So `clientStatus`
compares against today.

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

### Parent companies: transitive grouping, and why name is never a merge key

`components/b2b/models/client/parents/` groups subjects into one PARENT COMPANY
per real-world business. It is not a second `findDuplicates`: that one is
**pairwise** and returns suggestions, this one is **transitive** — if A shares a
phone with B and B shares a GST with C, all three are one parent. A parent is
what you hang several orders, contacts and GSTINs off; a suggestion is not.

It takes a `ParentSubject` (`id`, `company`, `contactPerson`, `phones`, `gsts`)
rather than a `ClientEntity`, so an order export can be grouped before any
client record exists. `parentSubjectFromClient` adapts the Client Database rows.
Both reuse `contactNumbers` / `gstNumbers` / `normalizeCompanyName` / the GST
helpers — nothing about matching is re-implemented here.

**It merges on exact phone, exact GSTIN, and the PAN inside the GSTIN** (chars
2–12), which is what links one legal entity registered in several states.
It **never merges on company name**, and that is the load-bearing decision.

Measured against a 941-order export on 2026-09-14, which is why the rule is
written this way rather than assumed:

| | |
|---|---|
| 941 orders | → **355 parents**; 198 hold one order, 13 hold ten or more |
| Phone | on all 941 rows; GST on 367 |
| **4 parents span two phone numbers** | found ONLY because they share a GST |
| Largest | 65 orders |

The case that justifies the whole module: one parent holds 44 orders — 39 placed
under an individual's personal name on one handset and 5 under the firm's
registered name on another — tied together by one shared GSTIN. No name rule
finds that, and a phone-only rule splits it in two.

And the case against name matching: 21 normalised names span more than one
parent, and merging on them would have collapsed 33 parents into other parents.
Most are **common Indian first names on different handsets** — the worst spans 4
parents carrying **three different GSTINs**, and two more span 4 and 3 — plus
`none`, a placeholder that appears on 9 rows. Auto-merging by name would invent
parent companies out of unrelated customers.

So those land in `nameOnly` as a review queue with the evidence attached, and
every one carries a verdict:

| Verdict | Means |
|---|---|
| `different-gsts` | the rows carry DIFFERENT GSTINs — positive evidence they are separate entities, not a reason to merge |
| `person-like` | one bare personal name across several phones |
| `placeholder` | `none` / `na` / `test` |
| `undecidable` | organisation-shaped, nothing proves it — a human decides |

**A shared GST can never appear in that queue**, by construction: two rows
sharing a GSTIN are already in the same parent. An early version reported
"shares a GST?" as merge evidence and mislabelled 15 of the 21 rows.

`readsAs` separates an organisation from an individual using a signal already in
the data — how many DIFFERENT contact people appear under one company name. The
75-order candidate has four and reads as an organisation; a 60-order one is his
own contact on 46 of those rows and reads as an individual. Without that signal
the biggest genuine merge candidate in the set was being dismissed as a bare
first name, because it is one word with no firm suffix.

`pickName` prefers a firm-suffixed name over the most frequent one — which is
why the 44-order parent above carries the firm's name rather than the individual's,
despite the individual's appearing on 39 of the rows — and reports which rule
chose it in `nameFrom`.

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
