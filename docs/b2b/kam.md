*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The KAM module: clients and orders are two things now

**Since 2026-11-28 the KAM order board below is no longer in the UI** (§Carts and PIs
are the KAM pipeline). These sections describe the stored `pipeline='kam'` rows the
Overview and Leadership still read.

`components/b2b/models/kam/` implements `KAM_Module_PRD.docx` v1.0 (KK).
`components/b2b/views/kams/index.tsx` is the tab, rebuilt around it.

§7 says the module "shares its client universe with the Client Database", so an
assigned client IS a `ClientEntity` and §3's interactions live on that record.
This module owns exactly one stored thing: the **Active Order**, still the same
`pipeline='kam'` rows — 30 of them, live, split between two KAMs who are
actually using them.

Opening a client opens the shared Firm page (`components/b2b/drawers/firm/`,
see `client-db.md`). `views/kams/drawer/index.tsx` only adds the KAM-only sections:
calls and meetings and escalations (the KAM pipeline card was removed on 2026-11-28), which fill
the page's Activity tab, open by default from KAM (`client-db.md` §The firm page
has tabs). So a number or GSTIN
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
`resolveKamOrders` fetches and PERSISTS the values on load; Overview resolves
for DISPLAY only and states how many are unresolved beside the revenue tile, and
My performance resolves for display too (2026-10-31). One writer, two readers —
deliberately, because two surfaces writing the
same rows on load is how the duplicate auto-advance note below got written.

### Gates on an interaction

`interactionGateErrors` hard-blocks a next follow-up date on a logged **Call**,
because §4.1 says one "is required … before it can be saved". Scoped to a call,
which is the word the document uses; a meeting is prompted instead, since a site
visit ending in "we'll call when the drawings land" has no honest date to give.

**Revenue credit is per enquiry (2026-11-12).** A KAM's revenue is every placed
order the Overview credits to them, not the KAM board's Closed orders
(`leadership.md` §Revenue is the Overview's per-order rule). A manager moves one
order to anyone on the team from the enquiry card or the Overview
drawer (`order-credit/ui/credit-line.tsx`, `overview.md` §A manager credits one
order). The per-record `revenueCredit` of 2026-10-30 is gone; production held none.

**Enquiry is a third interaction type (2026-10-30).** It is the client asking
for something. It needs what they asked for and a next follow-up date, the same
as a call. KPIs count interactions by exact type, so an Enquiry adds to neither
Calls nor Meetings. Interactions are a JSON column, so no migration was needed.

**A Meeting needs its minutes (2026-10-29).** The user asked that every
meeting a KAM or an Outreach BM has with a client carries a summary/MOM, so a
`Meeting` with an empty summary is refused and the field reads "Minutes of
meeting \*". A Call keeps the soft "No summary" prompt, because the ask was
about meetings. Outreach already hard-gated notes on a held meeting
(`outreach.md` §Meetings: notes and who was met are hard gates), so this
brings KAM level with it. Meetings logged before this have no minutes, and
the KAM KPI rows still say "No notes" for them rather than hiding them.

An order's requirement keeps its earlier versions when edited
(`data-layer.md` §Requirement history).

### §4.3's "actioned" needs no new field

A follow-up is actioned when a LATER interaction is logged, because
`nextFollowUp` reads the account's follow-up date off the **latest** entry
(deliberately not the earliest across the log — a follow-up set in March and
superseded in April is not still pending). So a firm leaves the Overdue tile the
moment the KAM logs the call, and nothing is ticked off by hand. Verified live.

Open question #3 (a floor on the queue) is answered no — an old unactioned
follow-up sits there indefinitely, because dropping it is how an account goes
quiet with nobody deciding to let it. `queueAgeBand` marks the age instead.

### Five groups: Carts & PIs, Calls & meetings, Referred clients, Accounts, Handovers (2026-11-28)

The user asked for KAM to be built like Inbound and Outreach (`inbound.md` §Three
groups), with Carts & PIs leftmost, and for the referred clients a firm sends to be
watched. The tiles sit in two rows: Carts & PIs and Calls & meetings, then Referred
clients, Accounts and a small Handovers. Every tile is one predicate giving its count
and its list (`firmLensMatches`, `ticketLensMatches`, `referralLensMatches` in
`models/kam/cadence.ts`), computed once in `views/kams/hooks/use-kam-lenses.ts`.
**Carts & PIs is the landing lens.** Upcoming and Details missing are pills.

| Group (head) | Tiles | Rule |
|---|---|---|
| Carts & PIs | Carts open · PI open · Carts follow up · PI follow up | **one row per open ticket** on the firms' numbers (§Carts and PIs are the KAM pipeline). Open = no follow-up logged on that ticket on or after the day it was raised; follow up = one was |
| Calls & meetings | Overdue · Calls today · Meetings today · No follow-up · Called today | the firm's next follow-up from its latest interaction **not on a ticket**. Today splits by Call or Meeting. Head = overdue or due today. Called today counts every Call, ticket ones too |
| Referred clients | Not at an EC yet · Cart no order · Ordered | one row per referred client (§Referred clients) |
| Accounts | unchanged | §Account status |
| Handovers | Waiting for sign-off | unchanged |

- **Carts come from the same Django read as Inbound and Outreach**
  (`POST /api/b2b/inbound/deals`, `useOpenDeals`, shared per-caller cache), posting
  every firm's numbers (a manager's: all firms, so the KAM filter costs no request)
  plus referred clients' numbers. It reads tickets opened since `openDealsSince`
  (11 Oct on 28 Nov), so an older open PI does not show here; the firm's Orders tab
  still lists it. One request on open, again every 5 minutes while visible.
- **A row's ticket opens under it** with the products (`DealInline`) and that
  ticket's follow-up history. Log follow-up is on the row; Open firm opens the firm
  page on Orders.
- Checked on 28 Nov in the sandbox as the manager, with two open tickets seeded on a
  KAM firm: one row each, Log follow-up on the cart moved it from Carts open to Carts
  follow up and Called today to 1, and the firm's Calls & meetings did not change.
  **Not yet seen on real data.**

### Carts and PIs are the KAM pipeline (2026-11-28)

The user: KAMs follow up and talk to clients to convert the open carts and PIs on
their firms, not a separate pipeline, and Carts & PIs is where keeping them moving is
tracked. So:

- **A follow-up is logged on a ticket.** Log follow-up (Carts & PIs row, or the firm's
  Orders tab on an open cart or PI) opens Log interaction for that ticket: Call or
  Meeting, notes, and the next follow-up date on it (required on a call). The
  interaction stores `enqId` and `ticketKind` in the client's `interactions` JSON, so
  no migration. `ticketFollowUps` (`models/client/derived/interactions.ts`) gives each
  ticket its log, last follow-up and next date; `nextFollowUp` (the firm's) now
  **skips** ticket interactions, so a cart follow-up never moves the firm's own call.
- **The KAM order board is gone from the UI:** the firm's KAM pipeline card and
  + Add order, and the Open orders, Pipeline and Order board pills, with their modal
  and auto-advance (`views/kams/orders/`, `models/kam/auto-stage.ts`,
  `upsertKamOrder`). The KAM tab no longer reads or writes `pipeline='kam'` rows.
  **The stored rows stay** and are still read by the Overview and Leadership, which
  resolve them for display (§The KAM module, below, now describes those legacy rows).
  Their per-PI follow-up dates no longer feed Reminders.
- **Reminders** show a KAM ticket follow-up as "Cart / PI follow-up" under Carts &
  PIs, only while the ticket is still open (the Reminders hook reads open tickets for
  KAM firms that have one logged, one request, shared cache).
- **The firm's Orders tab opens on PI shared, else Open carts, from KAM**, with a KAM
  follow-up column and the ticket's follow-up log inside each open row.

### A firm-level follow-up is a call or a meeting (2026-11-28)

Log interaction asks "The next follow-up is" A call · A meeting once a date is set
(`nextFollowUpFor`). A meeting fills Meetings today; a call fills Calls today.
Interactions logged before this read as a call. The KAM list's Next follow-up column
and the interaction log show which. A follow-up about a cart or PI is a ticket
follow-up instead (above).

### Referred clients (2026-11-28)

The user: an end client a firm refers (a design firm referring its own client) must not
go quiet before they shop. Rows come from the CRM's `b2b_referral` with
`referrerKind 'client'` on a firm in scope, plus Studio Space's client referrals on
the firm's studio (`studio-access`), deduped by number, CRM first. The referred
numbers join the KAM tab's one `b2b-bulk` read and the open-carts read, so this costs
one extra request (`/referrals`, cached 60 s), not one per client.

- **Ordered**: an order on the number in Django, or in Studio's referral ledger.
- **Cart, no order**: an open cart or PI, or any deal ticket (`enquiries > 0`).
- **Not at an EC yet**: the number was read and has no ticket at all. A walk-in who
  bought nothing leaves no ticket, so the rule says "ask the firm"; the CRM cannot
  see store visits without a cart. Oldest referral first; red after 7 days.
- **Unknown** (history not read) counts only in the head.
- Search reaches the referred client's name and number. Segment and Source filter by
  the referring firm. The row opens the firm on its Referrals tab.

**Studio Space details on every referred client (2026-11-28, the user: a Studio Space
visit showed far more than the CRM row).** A "Studio Space details" link on each row opens
everything Studio holds on that number: the referral (email, city, project, budget,
categories, notes, status), each booked store visit (centre, date, time, categories,
requirements, waiting / BM assigned / visited / cancelled, the store's check and note) and
the orders it filed. It reads one route, `GET /b2b/studio-referrals?phones=` (b2b-backend,
read-only, 50 numbers, cached 60 s in the browser), only when a row is opened.
A number no studio refers reads "Studio Space has no referral on this number", not an error.

**Referred clients is also a tile on Inbound and Outreach (2026-11-28).** It sits after PI
follow up in Carts & PIs and lists the clients referred from that user's own leads
(`referrerKind` `inbound` / `outreach`, `hooks/use-referred-clients.ts`,
`ui/referred-clients-table.tsx`). The stage rule is KAM's (`referralStage`). The tile costs
the cached `/referrals` read plus one `b2b-bulk` for the referred numbers, so a page with
no referrals adds no history read. Lead-side referrals never reach Studio Space (a lead is
not a studio), so their rows have no Studio link.

### Filters (2026-11-28)

Search, KAM (managers only), Segment and Source sit in the shared filter bar
(`ui/filter-bar.tsx`), the same one Inbound and Outreach use: each filter is a chip showing
its value, teal with a × when set, with Clear all. The predicates are unchanged; only the
controls moved (`inbound.md` §Filters).

### The tiles are the navigation (2026-10-28)

Same design as Inbound (`inbound.md` §The tiles are the navigation), on the
shared `components/b2b/ui/lens-tiles.tsx`. Each tile is a lens. `firmLensMatches`
and `orderLensMatches` in `models/kam/cadence.ts` give both its count and its
list. On 2026-10-28 every tile matched its rows in a browser on real Supabase
data, with Django stubbed.

**The tab paints before the order read (2026-11-28).** It waited for `b2b-bulk` on
every Client Database number before showing anything, measured at 1.0–14.6 s
(typically 3–5 s). Now firms, follow-ups and sign-offs show once `/rows` lands. The
five tiles that need order dates (Assigned, Active, Lapsing, Inactive, Never ordered)
read "…" with "reading orders", and a line above the list says status reads Unknown
until the history lands. Order lookups and auto-advance still run after it.

- **The groups were re-cut on 2026-11-28** (§Five groups, below). The 2026-10-28
  set was Follow-ups (Overdue, Due today, No follow-up, Called today), Accounts and
  Orders (Open orders, Pipeline). The follow-up buckets still partition the book.
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

### Who sees which firms (2026-11-02)

- **A rep sees only their own book.** Not a manager (`viewer.isManager`): firms
  where `ownsFirm` holds (the latest assignment's KAM phone when it names the
  firm's KAM, else `sameRep` on `kam`, so "Jadhav" rows are Krishna Jadhav's) and
  orders whose `kam` is them. No KAM picker. Screen-only, like every B2B scope.
- **Assigned means a firm has a KAM.** Since the 1,000+ firm import
  (`client-db.md` §The client_master import) most Client Database firms have no
  KAM. "All KAMs" and every tile count only firms with one; a manager reaches
  the rest under "No KAM yet". On 2026-11-02 production had 1,285 firms, 158 with
  a KAM (Krishna Jadhav 117 with the "Jadhav" rows, Tharun 27, Sai Suresh 8,
  Hardi 5, Vilok 1).
- Checked in the dummy CRM (:3100) as the KAM, Outreach and manager personas.
- **Who "me" is comes from the login number, through the team list.** The
  viewer's B2B team row is found by the phone they signed in with, and its name
  is what the name match uses. Django's own name for the login is used only when
  no team row matches, and Django can hold a placeholder there ("none"). So a team
  row on a number the person does not sign in with leaves them with an empty tab,
  every tile at 0 and no error (`landmines.md`, the KAM login-number entry).
- **An empty tab says why (2026-11-03).** A rep not on the KAM team is told the
  name and number they signed in with, and that a manager adds that number under
  B2B → Team. A KAM with nothing assigned is told a manager assigns firms here.
  A manager with no KAM'd firm is pointed at "No KAM yet". The old banner told
  everyone to "seed" the Client Database, which was true of none of them.
- **Krishna Jadhav is one person on the number ending 810 (2026-11-03).** Django
  has two `b2b_KAM` logins for him: ...807 named "Krishna Jadhav", which he does
  not use, and ...810 named "none", which he does. The team row and all 92 pending
  handovers carried ...807, and 25 firms, 15 orders and his logs said "Jadhav".
  On the user's word they were merged onto ...810: owners, assignment KAM and phone,
  `loggedBy`, note authors and Outreach/Inbound `kam` now read "Krishna Jadhav",
  the ...810 team row was added with the same Kylas user, and the ...807 row is
  inactive (the team route has no delete). 138 rows, written through
  `/rows/{id}/change`; production read back 117 firms, 92 pending on ...810, 15
  orders, nothing left on "Jadhav" or ...807. The roster keeps `Jadhav` as an alias,
  because free-text notes and the legacy target key still say it. The Django
  side is still owed (`backends.md` §Owed by Django row 15).

### Account status: calendar months since the last order, every firm (2026-11-27)

**Over 12 months is Never ordered (2026-11-28, the user's decision).** A firm whose last
order is M-13 or older reads **Never ordered**, the same as one with no order at all.
There is no "Inactive over 12 months" status, Client Database tile or lens key
(`m12plus`) any more; KAM's Inactive 4+ months tile is Inactive 4–6 and 7–12 together,
subtitle "last order Nov 2025–Jul 2026". It sits in `clientStatus` because the rule is
one for Client Database, KAM, the Firm page and the Overview. The Never ordered tiles
now read "none in 12 months", and their count grew by the firms that were over 12
(60 on 27 Nov, production). The sections below that say "over 12" describe the
rule before this change. Checked through the compiled `rules/status.ts` on 28 Nov: 31 Oct
2025 and 4 Jun 2025 are Never ordered, 30 Nov 2025 is 7–12.

**Bands count calendar months, not days (2026-11-27, the user's ask).** With M-0 the
current IST month and M-1 the one before, `clientStatus` takes the month of the
firm's latest `lastOrderPlaced` and counts back: **Active** M-0 or M-1,
**Inactive 2–3 months** M-2 or M-3, **Inactive 4–6 months** M-4 to M-6,
**Inactive 7–12 months** M-7 to M-12, **Inactive over 12 months** older. Never
ordered and Unknown (no read, or a future date) are unchanged. The point is
stability: a firm changes band only on the 1st of a month, never mid-month, so a
tile's count no longer shifts day to day. `ORDER_BANDS` holds the upper month of
each band; `statusMonths` turns a band into its month range for tile subtitles
("last order Aug–Sep 2026"), so the UI never restates the rule by hand.
`daysToLapse` counts to the 1st of the month the firm drops a band, for Active and
Inactive 2–3 months only. `nextStatus` names that band on the Firm page.

- **Checked signed in on production, 2026-11-27.** Client Database's six tiles (Active,
  Inactive 2–3, 4–6, 7–12, over 12, Never ordered) summed to All firms, with no Unknown.
  Each tile's count equalled its list. Each band's oldest and newest last orders fell
  exactly on its month edges: Active 1 Oct–27 Nov, 2–3 Aug–Sep, 4–6 May–Jul, 7–12 2 Nov
  2025–30 Apr 2026, and over 12 up to 25 Oct 2025. "4d left" showed on October and
  September firms, which drop a band on 1 Dec.
- **The Overview's client book matches since 2026-11-27.** It read 190 Active against
  Client Database's 194 because it skipped Studio Space orders; it now adds them
  (`docs/landmines.md`).
- **111 firms waiting on a KAM (production, 2026-11-27) is not a bug.** All 111 are
  Prafful's assignments to Krishna Jadhav (96 on 18 Nov, 15 on 20 Nov), with his current
  number (…810), so they show on his sign-off list; he accepted others that week and on
  27 Nov. Until he accepts or rejects, each firm has no KAM and counts under No KAM. A
  manager can respond for him from the KAM tab.
- **What moved against the day rule.** Active now covers between 27 and 61 days
  depending on the date, not a flat 30. On the 27th, a firm that ordered on the
  1st of last month is still Active; on the 1st of a month every firm from two
  months back drops at once. The KAM coverage denominator (`leadership.md`) and
  the Overview's client book move with it.
- **Renamed, not just re-cut.** The labels changed with the bands (1–3 → 2–3,
  3–6 → 4–6, 6–12 → 7–12, 12+ → over 12), and so did the Client Database lens keys
  (`m2to3`, `m4to6`, `m7to12`, `m12plus`) and KAM's long tile (Inactive 4+ months,
  `LONG_INACTIVE`). Nothing persisted the old names.
- Checked at each boundary through the compiled `rules/status.ts` (Node, the
  recipe in `CLAUDE.md`): on 27 Nov an order on 1 Oct is Active and 30 Sep is
  Inactive 2–3 months; 31 Jul is 4–6; 30 Apr is 7–12; 31 Oct 2025 is over 12; a
  date after today is Unknown; December's turnover works across the year.

#### The day-count bands it replaced (2026-11-06)

**Replaced the 30 / 60-day rule on 2026-11-06**, at the user's ask, so firms can
be targeted and handed to KAMs by how long they have been quiet. The bands are
`ORDER_BANDS` (`constants/client.ts`): **Active** 0–30 days, **Inactive 1–3
months** 31–90, **Inactive 3–6 months** 91–180, **Inactive 6–12 months** 181–365,
**Inactive 12+ months** after that. Never ordered and Unknown are unchanged. The
user listed four bands; 12+ was added so every firm with an order lands in one.
It stayed one rule for every firm, so KAM moved too: its "lapsing" tile is
Inactive 1–3 months (days to 90), and its "Inactive 3+ months" tile is the three
longer bands (`LONG_INACTIVE`). `daysToLapse` still only counts down for Active
and Inactive 1–3 months. The history below explains why the rule is shared.

#### The 30 / 60-day rule it replaced (2026-10-29)

The user set this rule for KAM in the morning and, the same evening, asked for
it on **every firm**. So there is one rule again: `clientStatus`
(`models/client/rules/status.ts`), used by KAM, Client Database, the Dashboard
and Leadership. Client DB's old 3-month window and its "Lapsing soon" tile are
gone; its middle tile is now Inactive 1 month, the same set as KAM's.

`clientStatus` counts days since
`lastOrderPlaced`. **Active** is 0–30 days, **Inactive 1 month** is 31–60 days,
**Inactive** is more than 60 days, and **Never ordered** is no order on record
for any of the firm's numbers. **Unknown** means the history was not read.
Never ordered was split out of Inactive on 2026-10-30: the user's definition
of Inactive is a firm whose last order is over two months old, and 20 of 35
"Inactive" Client DB firms had never ordered at all. It has its own tile on
KAM and Client Database, and its own segment on the Overview strip. Checked at each boundary in Node.
`daysToLapse` gives the days left before a firm drops to the next bucket. It
drives the "Lapses in" column and the pill's "Nd left".

Everything KAM reads it: the tab's tiles, the Firm page opened from KAM (through
`statusScale`), and the B2B Overview's KAM desk and Needs attention list (`overview.md`). Those
now treat at-risk as **Inactive 1 month with no
follow-up or an overdue one**, counted in days to 60. It also feeds the
Leadership Board's KAM coverage denominator (`leadership.md`). The old At risk
tile is gone: it was "Active, within 30 days of the 3-month cutoff", and the
middle bucket replaced it. A future-dated `lastOrderPlaced`, from the b2b-bulk
bug, reads Unknown since 2026-10-30 (it read Active before; `client-db.md`).

### No header actions (2026-10-29)

Export, Upload Orders and + Add Order were removed from the tab header at the
user's request. (+ Add Order on the firm page went too on 2026-11-28, with the
whole KAM order board.) The header button had
created orders with no client, which is what the board's "unlinked" count
reports. The CSV order importer (`views/kams/upload.tsx` and its validator in
`io/kam-import.ts`) went with it. That file keeps only the cell, phone and
delimiter parsing that the Client Database import still uses.

### Admin assigns firms, the KAM signs off (2026-10-29)

An admin selects firms in the Client Database (one or many) and assigns them to
a KAM, either by name or round robin. The KAM accepts or rejects from the
**Waiting for sign-off** tile here (`lists/signoff.tsx`).

- **The handover lives on the latest `assignments` entry**, as `status`,
  `how`, `kamPhone` and `respondedAt/By`. There is no new meta
  key. `assignments` is a real `b2b_client` jsonb column on the deployed
  backend. A new key would only persist once migration 0020's `extra` column
  ships, and until then it would be dropped silently. `firmHandover()` reads the
  latest entry only, **and on a merged firm only entries from its latest merge
  on** (`currentAssignments`, 2026-11-05; `client-db.md` §Merge).
  `ownsFirm` still reads every entry, because `kamPhone` there is what tells a
  KAM's two logins apart. **The Firm page's KAM picker goes through the same
  sign-off**: it is shown to managers only (`assignAs`), assigning there appends
  a `Pending` entry, and setting Unassigned appends one with no `status`, which
  ends any pending handover. Before this, any KAM could reassign a firm from
  its page and skip the sign-off entirely.
- **A pending firm already has `kam` set.** It counts in that KAM's book, tiles
  and coverage from the moment it is assigned, so a KAM cannot shrink their
  book by leaving it unanswered. Client DB also gets an **Awaiting KAM** tile while any firm is pending.
- **A KAM accepts or rejects (2026-11-03).** The user asked for Reject back so a
  KAM can turn down a firm and the admin reassigns it. Reject needs a reason,
  which Client DB shows under the KAM column as "X rejected: reason".
  `rejectFirmHandover` hands the firm to the previous holder: the latest earlier
  entry with no status or `Accepted`, skipping any for the same person
  (`sameRep`), so "Jadhav" never gets a firm back from "Krishna Jadhav". With no
  earlier holder it goes to No KAM. This is what makes Reject safe now. The
  31 Oct version cleared `kam` on every reject, and a test showed a rejected move
  leaving an active client with no KAM, which is why Reject was removed that day.
  On production on 3 Nov, 91 of the 92 pending firms had no earlier holder, so a
  reject sends them to No KAM. The Outreach-to-KAM handover has its own Reject,
  unchanged. Its Accept writes this tab's firm with an `Accepted` entry, so it
  never lands in Waiting for sign-off (2026-11-17, `outreach.md` §KAM handover).
  The assignment dates also decide revenue: a firm's order goes to the KAM who held it
  when the order was placed, even if another KAM opened the deal ticket (2026-11-18,
  `overview.md` §A teammate's ticket).
- **Assigning a firm to the KAM who already holds it is refused.** It used to write
  a pending entry and put the firm back in sign-off for nothing. The bar says it is
  already with them, and the Firm page closes the picker. Both compare with
  `sameRep`, so "Jadhav" and "Krishna Jadhav" count as one person.
- **Round robin uses book size, not `fetchKamLoad`.** It picks the active,
  in-rotation KAM holding the fewest firms right now, ignoring the firms being
  moved, and ties go by name. `/kam-load` counts converted Inbound and Outreach
  leads. It answers a different question (who got the most new conversions), and
  it costs a request. Book size comes from the list already loaded.
- **Who may answer:** the KAM it was assigned to (phone, normalised, then name),
  a manager, or anyone while the team table is not live. **A KAM's sign-off tile
  and list hold only the firms they may answer**, so every other KAM sees 0
  rather than a list of "Waiting on Krishna Jadhav" rows. A manager sees all. The 48-hour window
  matches the Outreach handover (`HANDOVER_TAT_HOURS`). The tile counts those
  past it.
- **One bulk write.** An assignment is one `POST /rows/bulk` (`upsertClients`).
  On failure nothing is assigned and the error says so. A partial set never
  shows as done.

### Per-PI follow-up and closure dates (2026-10-29, retired 2026-11-28)

**Replaced by follow-ups logged on the ticket** (§Carts and PIs are the KAM pipeline).
What follows describes the KAM order rows that are still stored.

The user confirmed that every PI carries its own follow-up date and closure date.
`KamOrder.followUpDate` (`meta.follow_up_date`, so it lives in the backend's
`extra`) sits beside the existing `expectedClosure`. **Both are hard-gated at PI
Shared**, and earlier open stages only get a prompt. The orders table has a
Follow-up column ("3d late", "Today", or "Missing" on a PI), and the firm's
order rows show both dates.

**The follow-up tiles still count firms**, from the latest interaction's date.
Making Overdue / Due today count PIs, or a firm whose PI is overdue, changes
what those tiles mean, so it was left for the user to decide. A PI with an
overdue date is visible in the orders table, not yet in the tiles. A PI Shared
order saved before this has neither date and is refused on its next save until
both are filled. That is intended.

**An optional time (2026-11-06).** The interaction log and the PI modal take a
time beside the next follow-up date (`nextFollowUpTime` on the interaction,
`follow_up_time` paired with its date on the order). The tiles above still bucket
by date. The time drives the Reminders tab, where both the firm's and each PI's
follow-up show for the KAM (`reminders.md`).

### A meeting starts with a check-in (built 2026-10-30)

The user, 2026-10-30: a rep checks in on arrival with their exact location, and
only then fills in what was discussed. **It is compulsory now.**
That reverses the 2026-10-29 decision that a missing check-in would only be
flagged.

- **The flow:** "Check in at a meeting" on the firm drawer opens
  `ui/check-in-capture.tsx`, which takes a high-accuracy GPS fix and saves a
  `Meeting` interaction with `checkIn {lat, lng, accuracy, at, by}` and no
  minutes. The drawer
  then shows "Meeting in progress". **Add minutes** opens Log interaction on
  Meeting, which completes that same interaction (`withInteraction` replaces it
  by id) instead of adding a second one.
- **The gate:** `interactionGateErrors` refuses a Meeting with no check-in when
  its date is on or after `CHECK_IN_REQUIRED_FROM` (2026-10-31), so meetings
  logged before the rule are not retro-blocked. A Call or Enquiry needs none.
- **The photo was removed on 2026-10-31, the day it shipped.** The user dropped
  it. The location is now the whole check-in. Rows saved while it existed may
  still hold `photoUrl` in their meta; nothing reads it. Backend `POST
  /b2b/check-in-photo` still exists and the CRM no longer relays to it.
- **KPIs skip an open check-in** (`inProgress` in `performance/teams/kam.ts`)
  until it has minutes, and the firm's next follow-up ignores it.
- **Not built:** a check-in on the Client Database firm page (KAM's own drawer has it).

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
