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

## Pushing a client to the partner dashboards

**Push to partner dashboards** provisions the Studio Sales firm for a client.
It creates the firm and never a login; `docs/b2b/partner-bridge.md` holds the
contract and the four rules the ingest route keeps.

What this tab owns is deciding *who is pushable*, in
`models/client/partner/`, and it leaves out more than it sends:

| Left out | Why |
|---|---|
| End Consumer | A homeowner is not a partner firm |
| No client type | Not the same as "not a firm" — we were not told, and it is reported as its own reason |
| No valid ten-digit primary number | The phone is the only key the partner side matches on |
| Two or more clients sharing one number | Which firm it is needs a person. **All of them** are left out, before anything reaches the wire. The label does not hardcode "two": it is a group heading printed beside its own count, so a number on three records would otherwise read "Two clients … · 3" |
| No contact person on the primary number | `partner.contact_name` is NOT NULL, and filling it with the company name would create a firm whose contact is itself |

That last one is a soft gap on purpose: the modal names the clients it affects
so somebody can fill the field in, rather than inventing a value that would
then look deliberate on the partner's own screen.

The **Studio Sales** column reads the link back — four states, never three:

| State | Means |
|---|---|
| Power user | Linked, and the firm can sign in |
| Provisioned | Linked, no login issued yet |
| Not on Studio Sales | No firm is linked to this client |
| Unknown | The roster could not be read — **not** the same as "no" |

The push and the column are both scoped to `admin` and `b2b_sales` by the route
handler, not by hiding the button. Which Django permission the B2B admin
actually carries is **unconfirmed** — both roles are allowed today so the
feature is not dead for whoever holds the other one, and it should be narrowed
once somebody checks.
