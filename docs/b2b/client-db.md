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
