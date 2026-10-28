*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/{views,drawers}/outreach/** · components/b2b/models/outreach/** · lib/b2b/outreach/** · lib/b2b/mappers/outreach.ts · app/api/b2b/waitlist`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchOutreachLeads()` + `fetchInboundForOutreach()` | Supabase `b2b_lead` (`select *`, paged 1000) | **One read**: both go through the cached all-rows fetch (`withB2BCache('rows|all')`). The created-date filter is applied client-side, so changing it refetches nothing |
| `fetchStudioWaitlist()` | `GET /api/b2b/waitlist` → `${PARTNER_APP_BASE_URL}/api/sync/waitlist` (`x-sync-key`) | One per mount. Behind `requireCaller` + `canUseB2B`. **The upstream route does not exist yet** — see *Studio Space waitlist* below |
| `upsertOutreachLead()` | `b2b_lead` upsert on `id` | Every single-lead write, always via `useOutreachData().save`, which runs `withJourney` first |
| `upsertOutreachLeads(list, { onlyNew })` | `b2b_lead` bulk upsert | CSV import (one request for the file) and inbound intake (`ignoreDuplicates`, so two managers assigning the same lead cannot overwrite each other) |
| `fetchLeadDeals(phone)` | Django `/crm/leads/?q=` | Drawer only, as before; now also feeds the 6-month new-onboarding check |
| `fetchKamLoad()` | `b2b_lead` closed rows | Drawer only, on "Round-robin" |

Mount cost: the `b2b_lead` read + the waitlist call, plus the shell's `/api/b2b/team`.

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

## The 2026-10-28 rebuild: Outreach as a journey that ends at the first order

Built from the user's brief plus rows 4–11 of the Studio Team KPI sheet
(`kpi-definitions.md` §Outreach). Everything below lives in the outreach row's
`meta_data` — **no new table**, so nothing waits on a migration somebody has to
paste by hand. New keys: `bm_phone, source, email, city, office_address,
team_size, whatsapp_group_link, converted_at, new_onboarding, intake, handover,
journey`, plus `pin` on each meeting.

### Who sees what (`hooks/use-outreach-scope.ts`)

Identity comes from the shell's `team` + `viewer` (`lib/b2b/team`, built by the
Inbound session). Manager (`b2b.manager` or a manager role) → every BM, a BM
filter, and a **Team** tab. Outreach member → only their leads. KAM member →
only handovers addressed to them, in a two-tab view (Sign-offs, Converted).
**If the team table is missing or failed**, everyone sees everything with an
amber notice — the soft gate, because the table is not applied yet.

A lead is "mine" by `bm_phone` (exact 10 digits) when it has one, else by name
with `sameRep`: equal, or one is a **whole-word** prefix of the other ("Vilok" ↔
"Vilok Reddy", never "Vil" ↔ "Vilok"). Old rows carry only a roster first name,
which is why the name rule exists; every write path now stamps `bm_phone`.
**This scope is client-side** — `b2b_lead` is read with the anon key, so it is
a focus aid, not confidentiality (same caveat as Inbound).

### Lead sources

`Inbound | EC referral | Dormant form | Own research`. "Dormant form" is the
user's "existing forms that are inactive": there is no integration for those
forms — their responses come in through the CSV import with `Source` set.
Inbound and EC referral are the two the **coverage** KPI is measured on.

**Inbound → Outreach** (`intake/`): the pool is inbound `b2b_lead` rows in
`Closed | PI Shared | Follow up | Connected` with no Outreach lead linked by
`intake.inboundLeadId` **or** on the same 10-digit mobile. Untouched Kylas `New`
leads have no `b2b_lead` row and are not in the pool, deliberately — Inbound has
not worked them. The Outreach row id is `OR-IN-<kylas id>`, deterministic, and
the write is insert-if-absent. A manager assigns (per row, or all round-robin
over active Outreach members by fewest intakes this month); a BM can "Take it",
which is auto-accepted. A manager-assigned lead waits for the BM to **accept**
(Inbound's KPI only credits after Outreach signs off) or **reject with a
reason** from `INTAKE_REJECT_REASONS`, which mirror Inbound's qualification
checklist so they can later score Inbound's lead quality. Rejecting moves the
lead to Lost with `Rejected from Inbound — <reason>`.

**CSV / Excel import** (`intake/import-modal.tsx`, `planImport`): parsed with
the existing `xlsx` dependency, so `.csv` and `.xlsx` both work. Header aliases
(Company, Phone, Contact number, GSTIN, Address…) are matched; required are
Firm name + Mobile. Every row is previewed with errors (blocks the row) and
warnings (imports with a fix-up) before anything is written. A mobile already in
Outreach is skipped; one that is an Inbound lead is imported with a warning, not
blocked — Outreach meeting an Inbound lead in person is the intended flow.
500 rows per file; rows past that are counted on screen, never silently dropped.

### The journey log (`withJourney` in `models/outreach/reminders.ts`)

Every write diffs before/after and appends `{at, by, kind, text}` to
`meta_data.journey`: created/imported, intake assigned/accepted/rejected,
status changes, meetings scheduled/held/postponed, first order verified,
handover sent/accepted/rejected, BM changed. **It is derived from the diff, not
written by each button**, so a new write path cannot forget to log. The drawer's
Journey card merges in the waitlist sign-up from Studio Space. Rows written
before 2026-10-28 have no journey; the card says so instead of showing nothing.
Writes from the Leads tab drawer (`views/leads/drawer.tsx`) do not go through
`withJourney` yet.

### Reminders and the "My day" view

`outreachReminders(lead)` is the one list of what a BM owes on a lead (meeting
passed but not marked, held without notes or a pin, follow-up overdue, fewer
than 2 follow-ups, Inbound/EC lead with no meeting, unverified conversion,
handover not sent / pending / past 48h / rejected, not on the waitlist, missing
mandatory fields). "My day" sorts them overdue → today → to do. A KAM gets a
different list: handovers waiting on their sign-off, with the 48h clock.
`onWaitlist: null` (Studio Space did not answer) suppresses the waitlist
reminder rather than claiming they have not joined.

### Meetings: notes are now a hard gate, the pin is not

A meeting marked Completed **blocks the drawer save until it has notes** — the
sheet names meeting notes as mandatory, and an empty held meeting is exactly the
log the KPI cannot validate. The **live pin** (`navigator.geolocation`, stored on
the meeting with accuracy and time) is asked for and counted, never required: a
BM logging a meeting after leaving the office cannot produce one honestly.

### Converted = first order, and only a fetched order counts

`Closed` is still the stored stage (see above on renaming stored values); it is
labelled **Converted** everywhere via `OUTREACH_STATUS_LABEL`. `converted_at` is
stamped once by `withJourney`. The move is not blocked, but the **conversion KPI
only counts `orderVerified` leads** (Enq ID fetched from the deal ticket,
`orderValueSource === 'deal'`); the rest show as "awaiting a fetched Enq ID".

**New onboarding** = no other ordered deal (`dealIsOrder`) on the same mobile in
the 183 days before the converting order (`newOnboardingFrom`). Computed when
the Enq ID is fetched, from the deals the drawer already loads. If those deals
failed to load it stays `undefined` and the revenue KPI says how many are
unchecked — it is never assumed new.

### KAM handover (`models/outreach/handover.ts`, drawer `cards/handover.tsx`)

Opens only on a converted lead. **Hard gate** (the payload the sheet says a
handover "must carry"): WhatsApp group invite link (`https://chat.whatsapp.com/…`
— the user named it as required for a proper handover), owner/designer,
10-digit mobile, segment, client type, team size, office address, project
details, ≥1 meeting held. **Soft** (prompted): order not fetched, no GST, no pin.
KAM is picked from active, in-rotation KAM team members (roster KAMs if the
table is not live), with the existing shared `fetchKamLoad` round-robin. Sending
and the KAM's accept/reject **save immediately** — they are events, not draft
edits. State: `ready → pending → (overdue after 48h) → accepted | rejected`;
a rejected handover can be resent. The KAM's response is built from the saved
lead and skips the BM's draft gates, so a BM's half-finished edit cannot block
a KAM sign-off. Who may respond: the KAM it was sent to (by phone, else name),
a manager, or anyone while the team table is not live.

### Studio Space waitlist

The waitlist is `waitlist_signup` in the Studio Space backend
(`MySite-Tech/b2b-backend`, migration 0009): one row per 10-digit mobile,
written by `studio.materialdepot.com/join`. That backend only exposes it to its
own staff login (`GET /console/waitlist`), so the CRM needs a server-to-server
read on the existing sync bridge: **`GET /api/sync/waitlist`** on the partner
app (relayed to the backend's `/sync/waitlist`), `x-sync-key`, answering
`{ signups: [{ phone, firm_name, contact_name, city, firm_type, team_size,
status, created_at }] }`. **Neither half exists as of 2026-10-28**, so
`/api/b2b/waitlist` answers 502 naming the missing route, the tab shows an amber
banner, the KPI reads **Unknown**, and the drawer chip reads "Waitlist unknown".

Matching is **exact on the 10-digit mobile** and nothing else, per the sheet
("contact number at waitlist and BM lead contact number should match"). A
sign-up whose mobile also has a converted lead is "ready for Studio Space
onboarding" in the KPI sub-line.

### KPIs (`models/outreach/kpis.ts`, `views/outreach/performance/`)

One function per sheet row, per head, for a chosen month (IST). Team totals
scale count targets by head count; % targets do not. Exact definitions are in
`OUTREACH_KPIS[].rule` and shown as each tile's tooltip; the non-obvious ones:

- **New-lead meetings** counts the first held meeting only if it has notes, an
  owner/designer name and a valid mobile — the sheet's "genuine lead" test.
  Missing pins are counted in the sub-line, not excluded.
- **Follow-up meetings** = unique firms with a non-first held meeting this
  month; the sub-line says how many reached 2 follow-ups or an order.
- **CRM adherence** = leads *touched* this month (created, status change,
  meeting date or journey event in the month) with zero gaps in
  `outreachAdherence` ÷ touched. GST is not in it (many firms have none).
- **Handover %** denominator is *all* conversions this month, verified or not.
- **Revenue** is first-order value of verified, new-onboarding conversions only.
  Later orders from the same client are not in it — this CRM does not track
  them per Outreach lead.

The KPI strip always counts the full scoped set; the filter bar only changes
the lists (a notice says so when a filter is active).

Verified 2026-10-28 by compiling `models/outreach/*` and running a fixture
journey (intake → meetings → conversion → handover → sign-off) through
`withJourney`, `outreachReminders`, `outreachKpis`, `planImport` and
`planRoundRobin`; and in the browser on the stubbed-Django dev server with the
`b2b_lead`, `/api/b2b/team` and `/api/b2b/waitlist` **GETs intercepted with
fixtures** and every `b2b_lead` write aborted, as manager, Outreach BM and KAM.

### Not built

- The upstream waitlist route (both repos) — contract above.
- A KAM-side client record on acceptance. Acceptance is recorded on the
  outreach row; creating the KAM account is the KAM sub-tab's brief.
- Inbound's "Send to Outreach" button. The pool reads Inbound's rows directly,
  so Inbound needs no change for this to work.
- Server-side enforcement of any of the above (all writes are anon-key client
  upserts, as for every other B2B board).
