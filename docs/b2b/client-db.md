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

### The GST per order, and the PI's items on the Firm page (2026-11-03)

`CRMLeadRow` now carries **`clientGst`** (the enquiry's `estimate.client_gst`,
item 5 on the Django side), plus `orderPlacedAt` and `bookedBranch`. The Firm
page's enquiry card (`drawers/firm/cards/enquiry.tsx`) reads it into
`gstOnOrder` and shows a **GST** fact per enquiry — so an order's billing GSTIN
is visible, not just the client's person name. (The old note here said
`CRMLeadRow` had "no GST at all"; that stopped being true with item 5.)

The same card's item list was renamed **Cart → Items** and now renders the
**PI's BOQ line items** (`boq_item`, qty, unit, `unit_selling_price`, line
total) when present, falling back to the ticket's `cart_items` otherwise. Those
BOQ items are per-line and heavy, so Django only returns them when the request
carries **`include=boq`** — which `fetchLeadsByPhone` (the Firm-page per-phone
fetch) now sends; the default `/crm/leads/` list stays lean. It adds no request,
only payload, to a call the page already makes.

**Enquiries billed to a firm's GSTIN on a number not on the firm are now folded
in.** `useFirmOrders(phones, gstins)` fetches the phone-matched orders AND, in
parallel, `fetchOrdersByGst(gstins)` (one `/crm/leads/?gst=` call using item 6's
exact GSTIN filter), then merges the GST-only rows deduped by enquiry
(`ticketId ?? enqId`). A GST-matched row shows the unlisted number under "Raised
on", so it reads for what it is. This retired the old amber `gsts.tsx` notice
that said `/crm/leads/` had no GST filter and the Django team still owed one —
it does now, and the Firm page uses it.

The KAM shown on the Firm page is the account's KAM **today**. Nothing in this
stack records who held the account at the time.

### The Firm page lists deal tickets, and many orders have none (2026-11-04)

The Enquiries & orders card can only list what `/crm/leads/` returns, and that
endpoint is rooted on Django's **deal tickets**. An `estimate` that no deal ticket
points at (by the ticket's estimate, or another revision of the same ENQ id) is
invisible to it, while `client-order-history` counts it. So a firm could show
"1 order" under each number and "No placed order on these numbers yet" in the
card below. Measured on production 2026-11-04 over non-deleted, unrevised
estimates since 1 Jan 2026: about a quarter of placed orders and nearly every
Quote Approval Pending PI have no deal ticket.

- **The card says so.** `unlistedOrders` (`drawers/firm/utils.ts`) compares each
  number's aggregate order count with the ordered rows listed for it. When the
  aggregate is higher, the Orders tab names how many orders are missing and why,
  and its empty text becomes "None with a deal ticket". It costs no request.
- **The fix is Django's** (`docs/backends.md` §Owed by Django row 18). The CRM
  already sends `estimates=1` on the Firm page's per-phone and GST reads
  (`fetchLeadsByPhone`, `fetchOrdersByGst`). Django ignores it today, so nothing
  changes until it ships, and then the missing rows arrive with no CRM change
  and the notice goes away by itself. They dedupe against tickets on
  `ticketId ?? enqId`, so a ticketless row must carry no `ticketId`.
- **PI shared is its own tab:** Orders · PI shared · Open carts · Lost. PI shared
  is an open row in `QUOTED_STATUSES` (Quote Approval Pending, Availability Check,
  Hold Stock, Payment Pending), the same set the Overview funnel calls quoted.
  `orderTab` is the one function both the tab counts and the lists read.

### A B2B SPoC and an EC on each open cart or PI (2026-11-04)

The user wants carts and PIs handled one at a time, not the whole firm. Each open
row's expanded card (`EnquiryActions` in `cards/orders.tsx`) has two lines:

- **B2B SPoC on this cart / PI**, picked from everyone on the live B2B team.
  Stored as `enquiry_spocs` (`{enqId, name, at, by}`), append-only, an unmapped
  meta key like `spoc_log`, so no migration. The latest entry wins
  (`enquirySpoc`). Only managers (`assignAs`) set it, like the firm's SPoCs. It
  does not feed Sales by SPoC yet.
- **Send this cart / PI to an EC**, with an EC and an optional BM
  (`ec-directed.md` §One cart or PI at a time). The KAM tab's whole-firm
  Redirect card was removed for it.

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

### The firm page has tabs (2026-11-28)

The same header-and-tabs layout the Inbound lead window got that day
(`inbound.md` §The lead window has five tabs). Nothing stored or shown was removed:

| Where | What |
|---|---|
| Header | firm name, primary number, status band, temperature, type · segment · source, a red "n details missing", Edit details (§Edit details), and the four SPoCs on one line with an "i" for how each holds it; Change opens People |
| Activity | KAM tab only, and its default: the children `views/kams/drawer/index.tsx` passes (calls and meetings with the check-in, escalations, the temperature mismatch; the KAM pipeline card was removed on 2026-11-28, `kam.md` §Carts and PIs are the KAM pipeline). Badge = interactions logged |
| Overview | the five stat tiles, the Unknown-status notices, Account (KAM with Assign/Reassign, assignment history, remarks, merged from) |
| Orders | Enquiries & orders (its Orders / PI shared / Open carts / Lost sub-tabs, per-enquiry SPoC and Send to EC), Sales by SPoC. Badge = open carts and PIs |
| People | SPoCs (Change/Add per team), contact numbers, GST numbers, Delete this firm at the bottom |
| EC & handover | EC visits and redirects, Handover from Outreach (absent when there is none, as before) |
| Referrals | Referred clients |
| Studio Space ↗ | only when the firm is on Studio Space: the firm's own dashboard ("their view", §Studio Space: their view) |

- **The KAM slot's Change on People jumps to Overview and opens the Account
  picker.** The picker's open state lives in the drawer, not the card, because the
  card unmounts on a tab switch; a nonce like the old one would either never open
  or reopen on every return to Overview.
- **A number's order count on People filters Orders and switches to it.** The two
  used to sit on one page, so the filter showed in place.
- **Orders, links and EC visits are still read once when the page opens**, not per
  tab, so the SPoC line in the header and the tab badges are right on open and the
  request count is unchanged. Referrals now reads only when its tab opens.
- Explanations (GST matching, Studio Space tiers, "matched by exact number",
  discarded tickets, why an order is unlisted) moved behind the "i". Labels are
  sentence case. The stat tiles' labels still render upper case because
  `StatTile` is shared (`ui/client-chips.tsx`).

### Edit details, and what a firm is missing (2026-11-28)

The user: whoever holds a firm (KAM, Client Database) fills its details on the firm
page itself, and the page says in red how many are still missing, so the count falls
as they are filled. `firmDetailGaps` (`models/client/rules/gates.ts`, the checks in
`FIRM_DETAIL_CHECKS`) is the one rule, read by the header, the KAM list's "n missing"
chip and the KAM Details missing pill. It asks for: contact person (on the primary
number), their designation, client type, segment, city, office address and GST. An
End Consumer is not asked for segment, office address or GST.

- **Edit details is on every firm page** (`cards/details.tsx`), red while anything
  is missing, for anyone who can open the page. It edits name, contact person and
  designation, client type, segment, source, city, office address, remarks, and adds
  a GSTIN when there is none (more GSTINs stay on People). It saves through the same
  `upsertClient`, under `clientGateErrors`.
- **`city` and `office_address` are new keys, and `role` on a contact.** They land
  in the backend's `extra` jsonb (`data-layer.md`), so no migration.
- **Client Database's old Edit pop-up is gone from the firm page.** `ClientModal` is
  now only Add Client. It also let anyone change the KAM there without the KAM
  sign-off; the KAM changes only through Account (`kam.md` §Admin assigns firms).

### A cart or PI on the Orders tab opens in full (2026-11-28)

The user could not read a cart's detail: a firm's open cart showed "Items: Tiles", a
category, and a grid of dashes. The old card fetched product lines only for `ENQ`
ids. The expanded row now renders `DealInline` (`ui/deal-detail.tsx`), the view
Inbound and Outreach use: one `/crm/leads/?enquiry_ids=<id>&include=boq` read per
ticket opened, product lines with qty, rate and amount for carts as well as PIs,
falling back to the list's own row (with a notice) when Django has no ticket. The
SPoC and Send to EC lines sit above it. Revenue credit shows only on placed orders,
with its rule behind the "i". Each sub-tab shows its total value, and an open cart or
PI shows how many days it has been open (amber past 14). The Overview's order drawer
uses the same card, so it changed too.

### Studio Space: their view (2026-11-28)

The user wanted to see a firm's Studio Space from its firm page. Studio Space already
has "Their view" (b2b-dashboard `lib/data/view-as.ts`): `/console/view-as?firm=<partner
id>` shows the firm's own dashboard to staff, read-only for the firm's KAM, acting for
an admin; Studio decides who may open it, the CRM does not. The tab (`cards/studio-view.tsx`)
appears when `studioFirmOf` finds the firm's studio. It signs the frame in through the
same handoff as the Studio Space tab (`useStudioSignIn`), and since the handoff always
lands on `/console`, the frame's first load sends it on to view-as. When no Studio login
has the caller's mobile it falls back to Studio's sign-in; sign in there and press
Reload. No backend change. On a local :3000 the handoff goes to the local backend, so
expect the sign-in page there.

### Four SPoCs on every firm, and sales by SPoC (2026-10-31)

The user: every firm has an EC, Inbound, Outreach and KAM SPoC, none compulsory,
filled as the firm moves along, so we can see what each SPoC sold and whether
sales drop after a move. A firm joining at Outreach has no Inbound SPoC, and
that is not a gap.

- **A manager picks a SPoC, never types one (2026-11-04).** Inbound and Outreach
  list the live team's members of that team (`useB2BReps().byTeam`), keeping a
  stored name that left the team as an extra option. Typing is the fallback only
  when the team list did not load, and the form says so. The KAM slot's Change
  opens the Account card's picker, so the firm still has one KAM control. EC stays
  typed, because a store BM is not on the B2B team.
- **No B2B person is ever an EC SPoC (2026-11-14).** The user: B2B people can raise
  and own orders, but they do it as Inbound, Outreach or KAM, never at an EC. The EC
  SPoC is the store person who serves the firm offline. `b2bSellerTest` (team names,
  the roster, a placeholder name like "none", or an order whose rep is homed on the
  `B2B` branch) is applied to the logged entry, the derived one and the "by EC SPoC"
  line, and Save refuses a B2B name in the EC slot.
- **A slot fills itself where a link exists, and a manager can log one.**
  `firmSpocs` reads Inbound and Outreach from the leads on the firm's numbers,
  KAM from `client.kam`, EC from the store rep on the last placed order. An entry in
  `spoc_log` beats the derived value. The KAM slot has no log of its own:
  `assignments` already is one, so it changes under Account.
- **Sending a firm to Inbound or Outreach from the assign bar fills that slot
  (2026-11-20; Outreach's wider rule 2026-11-27)** with a logged entry from that day, alongside a new lead in the
  team's tab (§Any firm can go to Inbound, Outreach or a KAM).
- **Most firms will show empty slots, and that is correct.** Measured on real
  rows 2026-10-31: of 69 firms, 60 had a KAM, 8 linked to an Outreach lead, 2 to
  an Inbound lead and none to both, because 62 are `Existing` accounts loaded in
  rather than walked through the journey. A blank slot says no lead was found on
  these numbers, never that the firm skipped the team, which we cannot know.
- **`spoc_log` needs no migration.** It is an unmapped meta key, so the backend
  keeps it in `b2b_client.extra` (0020). It is append-only with a `from` date,
  because a replaced SPoC has to stay a stage in the sales table. `from` is typed
  in, since a mid-journey firm's real start is often in the past.
- **Sales by SPoC splits orders by who held the firm when the order was created**
  (`spocSales`). Every order lands in exactly one row, including "Before the
  first SPoC on record" for firms loaded with a history. Per month is what shows
  a drop after a move. Store reps are a separate line and never added, the same rule
  as assisted revenue.
- **The split stays on Created, not placement (2026-11-05).** It asks who held the
  firm when the cart was raised, the same gate the Overview's classifier uses. The
  order list above it shows the placement time.
- **The table is per firm, on purpose.** It reads the ticket list the Firm page
  already loaded, so it costs no extra order request. Across all firms it would be
  one request per phone, which the request budget forbids. That roll-up waits on
  #8. Opening the drawer adds no request when the all-rows read is cached.

### Every column filters (2026-11-04)

The user found three dropdowns (segment, client type, KAM) too few to find a firm.
The table now has a filter row under its headings, one control per visible column:
text for Firm, Primary contact and EC SPoC, and a dropdown for the rest (thresholds
for counts and amounts, windows for Last order, the five statuses, Studio access,
KAM and the Inbound / Outreach SPoCs with a "none" option, type, segment, source).

- **Filters run after the metrics,** on the `ClientListRow` (`rowMatchesFilters`),
  so order figures, status and Studio access can be filtered. The tiles and the
  list header count the filtered set, as before.
- **A filter on a hidden column still applies** and stays as a removable chip,
  so hiding a column never hides why a firm is missing.
- **The table stays on screen when nothing matches,** so its filter row can be
  changed. The empty message sits under it.
- **SPoC filters scan the leads per firm,** lazily and cached per load
  (`spocsOf`), only for firms a SPoC filter actually checks. The page-only rule
  below still holds for the columns themselves.
- A filter on data that did not load (Studio Space, the Inbound and Outreach
  leads) is disabled and reads Unknown rather than matching nothing.

### Choosing the list's columns (2026-10-31)

The user asked for the Leads tab's column picker here, with a column per SPoC. It is
the same `MultiSelect`, kept beside the filters because its menu opens rightward: at
the far right it ran off the page and scrolled the whole screen sideways. The choice
is per browser, stored as the hidden keys so a column added later shows up by itself.

- **Inbound and Outreach SPoC use `firmLinks` and `firmSpocs`**, the Firm page's own
  rule, so the list and the page cannot disagree. They run on the visible page only,
  because each is a scan of every lead. This adds two reads on open.
- **EC SPoC is a logged name, else the store rep on the firm's last order at an EC
  in the last six months (2026-11-14).** Until then the list showed only logged names,
  production had none logged, so every row read "Not logged" and the filter matched
  nothing. `GET /api/b2b/revenue/ec-spocs` returns, per number, the newest order not
  booked on the B2B branch and not raised by a B2B rep (types 1 and 2), from the six
  monthly reports the Overview's trend already caches (`buildEcSpocs`). That is one
  request on open, and no Django read when the trend is warm. A firm whose last store
  order is older than six months reads "—". Older history still waits on
  `backends.md` §Owed by Django row 13. While it loads or if it fails, the column and
  its filter read "…" or Unknown.

### EC visits from the Firm page (2026-10-29)

Firms also order through the Experience Centres, not only through the B2B
team, so the user asked that any firm can have an assisted EC visit booked
from its page. The **EC visits** card (`cards/ec-visits.tsx`) books one (date,
time, EC and BM via `EcPicker`, who is coming, what they want to see) and
updates it to Visited / No show / Cancelled with an outcome and the Enquiry
ID of any order raised there.

- **Stored on the B2B backend, never in Kylas** (`b2b_ec_visit`, migration
  0021), through `app/api/b2b/ec-visits`. That route has its own file rather
  than going through the relay for two reasons: the relay has no PUT, and the
  Appointment Tracker's users (receptionists, presales) are not B2B users. So
  the GET is open to any signed-in caller, but it needs a firm or a date range.
  The PUT needs `canUseB2B`, and the route stamps `scheduled_by` and
  `updated_by` from the session, never from the body.
- **The EC name is the tracker's branch name**, because `EcPicker` already
  resolves CRM branches through `apptBranchesFromCrm`. The tracker can then
  match on equality rather than the fuzzy `sameBranch`.
- Cost: one request when the Firm page opens. The picker's branch-list call
  happens only while the form is open. A failed read says "Unknown" and hides
  the book button, rather than claiming the firm has no visits.
- Before migration 0021 the route answers 503 naming the migration, and the
  card shows that message.

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

**Every enquiry card lists the PI's items, wherever it opens (2026-11-03).** The
user wants item, quantity, rate and amount, not the ticket's categories, on any
screen that opens an enquiry. A row read with `include=boq` already has `items`.
A row without them (the Overview's revenue drawer reads a whole month, and BOQ
lines would make that read far heavier) asks for its own on expand: one
`/crm/leads/?enquiry_ids=<id>&include=boq`, cached per enquiry
(`fetchEnquiryItems`, `use-enquiry-items.ts`). A card without an ENQ ID (a cart
still `CT…`) has no PI and skips it. While it loads the card says so, and a
failed read says the PI could not be read rather than passing categories off as
items.

**The ticket's own fields say they are the ticket's (2026-11-12).** "Assigned to"
is now **Ticket owner (store)** and "Created" is **Ticket opened**, and the table's
column is **Branch · ticket owner**. Both are Django's deal ticket, which a store
opens on a client's first visit and every later cart attaches to. On
ENQ20261107102736 they read a Yelahanka salesperson and 12 Aug, for a cart built on
7 Nov that a KAM had worked. The user took them for B2B attribution and asked why
the KAM was missing. Who the revenue is credited to is the line above them,
**Revenue credited to**, and a row credited by a manager says so under its branch
(`overview.md` §A manager credits one order).

**Round robin only shares out firms with no KAM (2026-10-30).** The user:
after one round robin, the next one should take the new, unassigned firms, not
the database again. `useFirmAssign` drops every selected firm that has a KAM
before planning, and says how many stayed put.

**An owned firm moves one at a time (2026-10-31).** The user: a firm with an owner
never takes part in bulk assignment. One person takes an owned firm only when it
is the single selected row. In a larger selection owned firms are skipped, whether
the choice is One person or Round robin. This replaces the 2026-10-30 line that
let picking a name move every selected firm.

**An order shows when it was placed, not when its cart was created (2026-11-05).**
The user: an enquiry placed on 4 Nov read "1 Aug 2026" on the Firm page. That was
`createdAt`, which is the ticket's creation, older even than the enquiry (raised
31 Oct). The Orders tab's column is now **Order placed**, the row's
`orderPlacedAt` (`estimate.order_placed_time`) as date and time in IST, and the
expanded card adds an Order placed fact. Open carts and Lost keep Created, since
they were never placed. `ticketToOrderRow` keeps `placedAt` only on ordered
rows, and `byNewestOrder` sorts by it, falling back to Created. An ordered row
without `orderPlacedAt` shows "—", never its Created date under that heading.
**Not yet seen on a real response:** the field is in `CRMLeadRow` since item 5,
but no signed-in read has confirmed Django fills it. If every placed row shows
"—" after deploy, Django is not sending it (`backends.md` §Owed by Django #10).
The 2026-10-30 "Placed on" column was removed because it showed the hand-set
`closureDate`, and the expanded row still labels that date as hand-set. **Branch · SPOC is the cart owner, not where it was
booked.** `branch` is the owner's store and `spoc` is `assignedTo`, both
passed through untouched. The doubled surname ("Tanmay Jagtap Jagtap") comes
from Django's name join, not from the CRM. The booked-at branch is on the
estimate, which `/crm/leads/` also does not return.

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

Since 2026-11-03 Django filters `/crm/leads/` by exact GSTIN, and the Firm page
folds those enquiries in (§The GST per order above). Only deal tickets come
back, the same gap as §The Firm page lists deal tickets. Do not join GST to
enquiries by firm name or by PAN on the frontend. That is the name-merge
mistake §Parent companies rules out.

### Each number: classification, and Studio Space access read from Studio Space (2026-10-29)

Every contact on a firm carries a **classification** in its existing `label`
field (`CONTACT_CLASSES`: Owner, Partner, Designer, Purchase, Accounts, Site).
It is a select. A free-text label from before is kept as an extra option, not
wiped.

**Studio Space access is read, never assigned.** The first cut of this stored
`studioAccess` on each contact and let a KAM pick it. That was replaced the same
day, at the user's call: the CRM fetches it. `fetchStudioAccess()`
(`lib/b2b/studio-logins`, one call, cached 60 s so the Firm page, this list and
the Studio Space tab share it) reads `GET /b2b/studio-access` on b2b-backend
through the relay (`studio-access` is in `ALLOW`), which answers every Studio
Space login that has a mobile. The CRM matches its own contact numbers against
that map by the last ten digits.

- **Power user** = the login's `partner_user.visible_tabs` is `NULL`, the whole
  dashboard. **Normal user** = any restriction, which is how firms that use
  Studio Space only for order tracking are given a login. The tooltip lists the
  tabs left on. Do not read "Normal" as "Orders and Rewards only": the backend's
  optional tabs are clients, projects, portfolio, inspiration, launches, rewards
  and leads, and an owner can leave any of them on.
- **A login's mobile has two homes** (`app/people.py` `login_phone`): the
  studio's own `referral` row joined by `team_user_id` (source `self` or `team`),
  else `partner_user.phone`. The endpoint reads both, and since 2026-10-31 also
  `partner.phone` and `self`/`team` rows with no login, at the owner's access
  (`studio-space.md` §Read from Studio Space). A mobile that appears in none
  of these is "Not onboarded". If both name the same mobile and any is Power, it
  is Power.
- **Shown in two places.** The contact card has a read-only badge per number,
  and the Client Database list has a **Studio Space** column, decided per firm
  by `studioFirmOf`: Power if any login at the matched studio is, else Normal,
  else Not onboarded (`studio-space.md` §Read from Studio Space).
- **A failed read says Unknown**, never "Not onboarded". The badge, the column
  and the Studio Space tab all do. Not onboarded would be a confident claim
  about every firm at once.
- **Nothing is written.** `studioAccess` and `studioOnboardedAt` are gone from
  `ClientContact`. Contacts saved earlier still carry them in the `contacts`
  jsonb. They are ignored and harmless, and the mapper passes them through on
  the next save.

Needs b2b-backend branch `b2b-studio-access` (one read route in `b2b_crm.py`, no
migration). Until it is deployed the route 404s and every surface above reads
Unknown. It was only syntax-checked: no FastAPI or database was available when
it was written, so run it against newdb before merging. The sandbox stub
(`scripts/sandbox/routes/b2b-backend.mjs`) answers it with up to four logins
taken from the seeded clients.

### The list: tiles are lenses, filters narrow them (2026-10-28)

Same shape as Inbound and KAM, on `components/b2b/ui/lens-tiles.tsx`.
`clientLensMatches` (`views/client-db/utils.ts`) gives both a tile's count and
the list it opens. Tiles: All firms · Active · Inactive 2–3 months · Inactive 4–6 months ·
Inactive 7–12 months · Over 12 months · Never ordered, then No KAM, plus Unread only when some
firm's orders did not load. The bands are calendar months, M-0/M-1 Active through M-13+
(`ORDER_BANDS`, `kam.md` §Account status, 2026-11-27), and `LENS_STATUS` maps each status
tile to its band, so the tile and the list cannot disagree. Each tile's subtitle is that
band's month range from `statusMonths`, so it reads the real months ("last order Aug–Sep 2026").

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
- **Never ordered is not Inactive (2026-10-30).** Inactive is a last order
  over 60 days ago. The Inactive tile used to fold in firms with no order on
  record and said so in its subtitle ("20 never ordered"); the user corrected
  the definition, so those firms are their own tile.
- **A last-order date after today makes the firm Unknown (2026-10-30).** Until
  then it was flagged amber and still counted as Active, which inflated the
  Active tile; the user had taken the flag for a fix. `clientStatus` now returns
  `Unknown` for it (`lastOrderInFuture` is the same test), so it sits under the
  **Status unknown** tile with "future date, not counted" under the date, and
  the Firm page says why. This is still not the fix: the real date is not in
  any response the CRM gets. Every source was checked on 2026-10-30. `b2b-bulk`'s
  `lastOrderDate` is the wrong one. The per-phone tickets carry only
  `closureDate`, which is the same expected-closure date. b2b-backend holds
  only Studio Space referral orders (`ordered_on`), not every order. The fix
  is in Django: `b2b-bulk`'s `histories[phone].lastOrderDate` should be
  `max(estimate.order_placed_time)` over that phone's non-deleted, placed
  estimates. The CRM already takes the max across a firm's numbers, so no
  frontend change is needed when it ships. Future dates then just stop
  happening.
- **Unknown is decided per number (2026-11-02).** `fetchB2BBulk` returns
  `unread`, the numbers whose batch failed, and `orderDatesFromAggregates`
  marks only those unloaded. It used to keep one `ok` for the whole read, so
  with 1,285 firms a failed first call turned every firm Unknown, and a failed
  later batch read as Never ordered (`docs/landmines.md`). Production's KAM tab
  showed 1,285 Unknown on 2026-11-02; which call failed there was not seen,
  because no signed-in session was available.
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
with Outreach's pool and the Leads tab). The bar picks the team first. KAM is always open, because a firm's owner is
its `kam` field and sign-off is on the KAM tab. Inbound and Outreach are always open too, for any firm
(§Any firm can go to Inbound, Outreach or a KAM). One person lists every active KAM.
Round robin starts from the in-rotation KAMs, and the manager ticks the set for
that assignment (2026-10-31). Select all takes the whole lens, not just the
page. Either choice writes a pending handover
that the KAM signs off on the KAM tab. The rules (where the state is stored,
why it is book size and not `/kam-load`, what a KAM's Reject does to the firm) are in `kam.md`
§Admin assigns firms. The checkbox column renders only when `picked` is passed,
so non-managers get the old table unchanged.

### Any firm can go to Inbound, Outreach or a KAM (2026-11-20, opened up 2026-11-27)

The user: the Client Database is not only for KAMs, and that is the reason every
firm has an Inbound, Outreach, KAM and EC SPoC. This settles the 16 Nov open
question ("a new Outreach lead, or an Outreach BM owning the firm?"): **both.**

- **No firm is reserved for a team, and no time window gates a send (2026-11-27).**
  The user: anyone can take any firm. A manager sends a firm to Outreach, to
  Inbound or to a KAM because they choose to, whatever its order history (Active,
  any Inactive band, Never ordered, Unknown) and whoever holds it now. All three
  team buttons are open for every selection. **Don't add an eligibility rule back.**
  The 2026-11-20 version opened Inbound and Outreach only for firms with no order in
  over 6 months, and on 2026-11-27 a B2B manager could not send a KAM firm quiet for
  90–180 days, or a newly closed Inbound firm, to Outreach. The first fix only
  widened the windows. The user rejected that as still rigid.
- **What still skips a firm, because the data needs it:** a firm with no phone
  number cannot become an Inbound or Outreach lead, and a firm with an open lead
  on that team is not given a second (below). The note counts both. On KAM, bulk
  still takes only firms with no KAM, and an owned firm moves as the single
  selected row (§Assigning firms to KAMs, the 2026-10-31 assign-bar rule).
- **What a send writes**, in this order (`use-firm-assign.ts`):
  1. a new lead in that team's own tab, so the person actually sees it. Outreach:
     source **Client Database firm** (rows sent 20–27 Nov read **Inactive firm**),
     a pending intake the BM accepts or rejects
     (`firmToOutreach`, `POST /rows/bulk {only_new}`). Inbound: a `crm-` lead,
     stage New, source Other, owned at once, nothing written to Kylas
     (`firmToInbound`, `insertInboundLeads`). The lead's note / summary says it came
     from the Client Database, the status band, the last order date, lifetime orders
     and value, and the KAM. Same shapes as Review new firms, built from a
     `ClientEntity` instead of a `ReviewFirm` (`lib/b2b/client-import/utils/firm-send.ts`).
  2. a `spoc_log` entry on the firm (`role` inbound/outreach, `from` today, `by` the
     manager), so the Firm page's SPoC slot and Sales by SPoC start that stage today.
     A logged entry beats the lead-derived SPoC, which is why it is written rather
     than left to `firmLinks`: an older logged SPoC would otherwise keep winning.
- **The KAM is not touched.** The firm keeps its KAM; the SPoCs record who is now
  working it. Sending to Outreach does not remove it from the KAM's book.
- **One open lead per team.** A firm with an open lead on that team on any of its
  numbers is skipped (Outreach: an open status and not rejected; Inbound:
  `isOpenStatus`), read fresh on click, not on mount: `fetchOutreachLeads` or
  `fetchInboundBoard` (which must answer `ok`). Move such a lead from that team's
  tab instead. A Lost or Closed old lead does not block a new one.
- **Round robin** reuses each team's rule: Outreach by this month's intake load
  (`planRoundRobin`), Inbound by open leads held (`openLeadLoad`, shared with
  Review new firms). The team list and Inbound's Kylas-linked members come from
  `useAssignTeams`, also shared with Review new firms.
- **If the leads save and the SPoC write fails,** the note says the leads exist and
  to set the SPoC on each Firm page. Nothing rolls back.
- **Known gap:** if an Outreach BM rejects the lead, the firm's logged Outreach SPoC
  still names them until a manager changes it on the Firm page or sends it again.
- **2026-11-27, sandbox only:** every seeded firm, from 10 days to 420 days since its
  last order, opened all three teams. One Outreach send of an Active, a 45-day and a
  130-day firm made three Client Database firm leads, and a second send was refused
  for the open lead.
- **2026-11-27, signed in on production as a manager (read-only):** one firm from each
  of Active, Inactive 2–3, 4–6, 7–12, over 12 months and Never ordered opened Inbound,
  Outreach and KAM. The pickers listed 3, 4 and 5 people, and there were no console
  errors.
- **2026-11-27, a real send on production.** A dummy firm (never ordered, no KAM,
  remarked as a test) was added, sent to one Outreach BM with One person, and checked:
  the note named the BM; the backend held an `outbound` row with source **Client
  Database firm**, stage Yet to Meet, owned by the BM, with a pending intake; the firm's
  `spoc_log` had the BM as Outreach SPoC from that day; the Firm page showed it; and
  Outreach → Waiting for sign-off listed the lead with Accept and Reject. Both rows were
  then deleted, and the B2B row count returned to what it was. The run found two list
  bugs, both fixed the same day (CRM PR `client-db-list-fixes`, `docs/landmines.md`):
  the Status column filter still offered the 30/60-day labels and matched nothing, and
  the list's SPoC columns kept a firm's old SPoC until a reload.
- Seen on the sandbox only (two seeded firms, `CLI-SBX-0003` 250 days, `CLI-SBX-0004`
  420 days and no KAM): Outreach to one person, Inbound by round robin, a recent firm
  refused, a second Outreach send refused for the open lead, both SPoCs on the Firm
  page, and the BM seeing both leads on Outreach. Not yet signed in on production.

### §2.1's window is anchored to TODAY, and the PRD does not quite say that

**The window is the month bands of 2026-11-06** (`kam.md` §Account status), not
the PRD's 3 months, and not the 30 / 60 days of 2026-10-29. The anchoring
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

### Who can add, merge and delete (2026-10-31)

Add Client, Bulk Upload, Seed from leads, Merge and Delete show only for
`viewer.canManageTeam`: admin, superadmin, `b2b_manager`, or the `b2b.manager`
permission. A team roster `is_admin` is not enough, on purpose: the server check has
only the caller's role. **`relayB2B` refuses a client-row DELETE and
`studio-number` from anyone else**, so a merge is covered too, because it deletes.
Adding is gated on screen only: `POST rows` cannot be refused for a new client,
because the Outreach handover and every KAM's edit use the same write.

Delete asks for the firm's name typed out. It removes the Client Database row, not
order history, which was never stored there.

**A parent company is a merge with a name.** The Merge window takes any firms found
by search, and an optional parent company name that replaces the name conflict. The
merged row keeps every number and GST, so their orders roll up.

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

**A parent firm shows only its own KAM (2026-11-05).** The user, about a parent
firm merged from three: its KAM had rejected one of the three firms it was merged from, and the
parent, which that same KAM holds, still read "<KAM> rejected: …". A merge
concatenates every source's `assignments`, and the list shows the newest entry.
All three were assigned in the same second on 31 Oct, so the tie went to the
rejected one. Now a merged firm's handover state and Assignment history start at
its latest `mergedFrom[].mergedAt` (`currentAssignments`). The sources' entries
stay stored but no longer show. A merge also appends one entry for the KAM it
kept ("Kept as KAM when the firms were merged", no status, with that KAM's last
`kamPhone`), so the parent's history begins with who it went to. Run over the
1,269 real firms on 5 Nov, it changed only merged firms: that firm's rejection
cleared, and 9 lost an Accepted state that nothing on screen shows. Every one
kept its KAM.

**Finding duplicates is indexed, not pairwise (2026-11-05).** `findDuplicates`
compared all 805k pairs of 1,269 firms, 87 ms on every change to the list
(each save and assignment). It now pairs only firms that share a phone, GST, PAN
or normalised name, the only things that can be evidence, in 3 ms. On the real
list it returned the same 15 pairs in the same order.

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

## The client_master import (2026-10-31)

The firms uploaded on 2026-10-29 were in the backend's `client_master`, which no
CRM code reads, so they appeared nowhere. It holds 1,280 parent entities, with
blank SPoC, segment and client type. The user wanted them here, not in Leads.

- **1,208 were copied into `b2b_client`, and 72 skipped.** A firm was skipped when
  its phone, GSTIN or exact name was already on a client row. A firm known only to
  KAM, Outreach or Inbound was still added. Skipped firms were not edited.
- **Ids are `CLI-CM-<client_master id>`,** so the batch can be found or removed.
  Rows have no owner, `source` Existing, and `import_batch` in `extra`. GSTINs that
  fail `GSTIN_SHAPE` were left off.
- **It was a one-time copy.** Later edits to `client_master` do not reach this tab.
  New firms are now found on orders and reviewed by a manager (next section).
  Four names differ only by case or spacing and were kept, because their phones
  differ. Use Merge.
- **Reading it:** `/client-master` is staff-only and Cloudflare challenges curl. A
  real browser signed in through the Studio handoff gets through. The write was
  `POST /b2b/rows/bulk` with `only_new`, tested first with fake rows on :3100.
- **Verified on production:** the tab reads 1,278 firms, all loading their order
  status through the batched history calls.

## Review new firms: found on orders, decided by a manager (2026-11-07)

Client Database → **Review new firms** (managers only) lists every firm billed with a
GSTIN on a placed order in the last 12 calendar months that is on no B2B board. A
manager ticks firms and sends them on, or marks them **Not a client**. Nothing joins a
board without that click. The rule for finding firms is the one below.

**First opened on production on 2026-11-27,** signed in as a manager: the first read
took under a minute and listed 945 firms to review, with 0 marked Not a client. Nobody
has worked through it yet.

| Call | Endpoint | When |
|---|---|---|
| `fetchReviewQueue()` | `GET /api/b2b/client-import` → Django `/crm/leads/?order_from&order_to&branch_basis=estimate` (12 calendar-month windows, 3 at a time) + backend `GET /rows` + `GET /client-review` | On opening Review new firms. The orders are cached server-side for 30 minutes, one global key, and a read in flight is shared. Rows and decisions are read fresh every time. **Refresh** re-reads the orders |
| Add to Client Database / KAM | `POST /rows/bulk` (client rows) | KAM writes a Pending assignment that the KAM accepts on the KAM tab (`kam.md` §Admin assigns firms) |
| Outreach | `GET /rows` once for round-robin load, then `POST /rows/bulk {only_new}` | Source **Store orders**, a pending intake that the BM accepts or rejects |
| Inbound | `GET /rows` once for round-robin load (CRM rows only, no Kylas), then `POST /rows/bulk {only_new}` | A `crm-` lead, stage New, source Walk-in, owned at once. Nothing is written to Kylas |
| Not a client / Undo | `POST /b2b/client-review`, `DELETE /b2b/client-review/{key}` (b2b-backend migration 0025) | Relay is manager-only for reads and writes |

- **Why review, not auto-import.** PR #45 first added every new GST firm on Client
  Database open. On 2026-11-06 that ran on the local real-data copy and added 161
  firms from 14 days of orders. 88 had their first-ever order in that fortnight and
  89 GSTINs were individuals or proprietors: mostly store walk-ins who asked for a
  GST bill. A Client Database firm with no SPoC counts as **EC Direct** with its
  whole history (`overview.md` §Four revenue channels), so the order that qualified
  a firm was also counted as its B2B revenue. Locally, November's B2B revenue
  roughly doubled against production, and past months rose too, because a firm's
  older orders count as well. The user asked for a list to verify by hand instead
  (real figures are in memory, not here). Accepting a firm still brings its
  whole history into EC Direct: that rule is unchanged and is the user's to change.
- **Firms already on a board are left out,** by any number or GSTIN on a client row,
  an Inbound lead (`inboundPhones`, `gstNumber`) or an Outreach lead
  (`outreachPhones`, `gstNumber`), Lost and Invalid leads included. The user chose
  this on 2026-11-07 over listing them with a chip. It keeps an Inbound lead from
  being copied to Outreach, which the user ruled out (`outreach.md`).
- **Only Not a client is stored.** Every other choice creates a row on a board,
  which takes the firm off the list. A decision matches a firm by its key
  (`CLI-GST-<first GSTIN>`) or by any GSTIN or number it saved, so a firm that gains
  a second number or GSTIN later stays rejected. Undo deletes the decision.
- **One firm per connected set of GSTINs and numbers.** Two numbers billed to one
  GSTIN, or one number billing two GSTINs, are one row (union-find over both). It is
  named after the client on its most recent order, which is often a person's name.
  A firm with no 10-digit number is counted and left out.
- **Type comes from the GSTIN's PAN** (its 4th letter, GSTIN position 6): C company,
  F partnership or LLP, P an individual (a proprietor), anything else Other.
- **The GST is the order's (`estimate.client_gst`), not the profile's.** The
  2026-10-31 export read `users_user.gst_number`, and that field has almost stopped
  being filled. Phones first qualifying by it fell from 120 (May 2026) to 42, 9, 6, 3,
  3 and 0 (November), while by either GST it was 126, 172, 214, 247, 247 and 213.
  `/crm/leads/` carries only the order's GST, so a firm whose GST is only on its
  profile is missed. That is 0–3 a month now, and the 2026-10-31 copy holds the
  older ones. Of the 161 firms above, 3 had a profile GST.
- **The GSTIN must pass `GSTIN_SHAPE`.** The export's `GST IS NOT NULL` let `''`
  through (474 orders), which is why about 125 of the 1,200 firms have no GST.
- **The five internal-BM numbers the export dropped are not filtered.** Over 360
  days they decided 1 firm, and listing them would put staff phone numbers in this
  public repo. A manager can mark such a firm Not a client.
- **Only a B2B manager can open it**, server-checked, because Django's `/crm/leads/`
  answers from the caller's token and the read must be company-wide.
- **Verified** on synthetic orders through the compiled `utils/queue.ts` (grouping,
  board exclusion by client GST, Inbound `+91` number and Outreach alternate number,
  a decision matched by number under another key, non-orders, bad GSTINs, no phone).
  On `npm run dev:sandbox` the manager sent one firm each to Outreach (one person),
  KAM (round robin), the Client Database and Inbound (round robin). The manager also
  marked one firm, undid it, re-marked it and reloaded. The Inbound persona gets 403
  from both routes. **Not yet run on real data,** where PR #45's preview measured roughly
  950 firms. The first read takes up to a minute.
