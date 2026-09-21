*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The partner bridge: P1 is built, P2-P4 are still design

**Status 2026-09-21: P1 below is built and merged on `b2b-partner-bridge`.**
The link between a Client Database row and a Studio Sales firm exists, the
Client Database can push it, and the Dashboard reads power users back. P2-P4
are still design and the rest of this file still reads as one. It is the agreed shape for
`Outreach_KAM_Handoff_PRD.docx` v0.1 (KK) and for connecting this CRM to the
partner-facing app in `daaku-daddy/B2B-Client-Dashboard`. Read it before
designing any of §3–§11 so the decisions below are not re-litigated; do not read
it as a description of behaviour. Full write-up with the diagram:
<https://claude.ai/code/artifact/56578244-15df-4819-8221-013401669e35>

### The finding that reframes the PRD

PRD §11 — the client-facing dashboard — is **already built and deployed** at
`b2b-client-dashboard-eight.vercel.app`. Its ingest contract
`POST /api/sync/referrals` is written, production-tested and idempotent.
**Nothing has ever pushed to it.** Live on 2026-09-14 it held one firm, the
demo seed, while this CRM's Client Database held 41 client rows of which **26
are Architect or Interior Designer with a valid ten-digit phone** — the exact
key that app joins on.

So the gap is not the client dashboard. It is the producer that should feed it,
plus the §7/§10 handoff that should create its users.

### Where the PRD stands against this repo

| § | Asks for | Status |
|---|---|---|
| §2 | Five roles incl. MD and a client login | Partial — `B2B_ROSTER` has KAM/Inbound/Outbound/Admin only |
| §3 | BM↔Zone map, daily visit + follow-up targets, rollup by Zone | **Missing.** No zone concept anywhere; `b2b_target` is one row of monthly revenue goals, a different thing |
| §4 | Mon–Wed new / Thu–Sat follow-up, auto-classify, soft warn | **Missing.** The four-slot meeting loop in `models/outreach.ts` is where it hangs |
| §5 | Lead fields, Hot/Warm/Cold, stage ladder, next-date gate | Mostly done — `outreachGateErrors` already gates the next date. New: **Company Size, Team Size** |
| §6 | Catalogue/sample request → Admin approval, four statuses | **Missing** |
| §7 | Mandatory handoff meeting + four-item resource checklist | **Missing — this is the core of the PRD.** Today "handoff" is a KAM dropdown and the round-robin button in `drawers/outreach/cards/meetings.tsx` |
| §8 | Meeting every 12 days, green/amber/red, satisfaction + inputs | Partial — `ClientInteraction` carries date/summary/temperature; the meter is a new derivation, satisfaction and free-text inputs are new fields |
| §9 | Order-volume tiers, inactive on missed cadence | Partial — `clientStatus` is three-month recency with three states |
| §10 | Onboarding form → Admin → MD → dashboard provisioned | **Half built.** The row is provisioned from the Client Database (P1); the form and the credential chain are not |
| §11 | The client dashboard | **Built.** See above |

### Direction of trust: this CRM writes, the partner app reads

Order history, visit events, reward totals and client status are **pushed** into
the partner project and are read-only to the partner. The partner owns exactly
two things: the referrals they raise and their own portfolio. That split is
already how that project's RLS policies are written.

**The partner app must never call Django.** Its browser cannot reach it and its
server route already hits Cloudflare ahead of Django's CSRF check — a live,
documented wall in that repo, not a guess. §3–§10 therefore live here; §11 stays
separate because it is the only surface an outsider signs into, and the only one
running with RLS **on**.

### What is built, as of 2026-09-21

Two routes and one button, across the two repos:

| Piece | Where | What it does |
|---|---|---|
| `POST /api/sync/partners` | Studio Sales | Creates or links a `partner` row by `md_client_id`. Creates **no login** |
| `GET /api/sync/partners` | Studio Sales | The link roster: `has_login`, referred clients, approved orders and value, orders pending |
| `app/api/b2b/partner-push/route.ts` | here | The producer. `requireCaller`, `admin`/`b2b_sales` only, holds the shared secret and relays both verbs |
| `models/client/partner/` | here | Pure: who is pushable, the four link states, the totals |
| Push to partner dashboards | here | A button on the Client Database, with the plan and what came back |
| Studio Sales column | here | Per client: Power user / Provisioned / Not on Studio Sales / Unknown |
| Three Dashboard tiles | here | B2B Clients, Power Users, Referral Orders |

Migration `003` was **not** needed: `partner.md_client_id` and its unique
constraint have existed since `003_roles.sql` on the partner side. Nothing was
pasted into Supabase for any of this, and nothing needs to be.

Four decisions inside the ingest route that are easy to undo by tidying up, and
should not be:

- **Provisioning is not a login.** A pushed firm has no `partner_user`. One
  press can create twenty-six firms and hands out zero credentials.
- **The firm owns its own profile.** On an existing row the sync fills blanks
  only; a firm that renamed itself keeps the new name through every re-push.
  Only `md_client_id`, `market`, `onboarding_source` and `internal_note` are
  written over, which is exactly the set `partner_guard_md_fields()` already
  refuses a firm.
- **A phone carrying a different `md_client_id` is reported, never merged**, and
  a linked id arriving on a new number is a reported conflict rather than an
  applied change.
- **Two CRM clients sharing one number are both left out**, on this side, before
  anything reaches the wire. `planPartnerPush` reports them as `shared-phone`.

The link state has **four** values, not three: `unknown` is what a client reads
when the roster could not be fetched, and it is never rendered as "not on Studio
Sales". Same for the Dashboard tiles, which read `Unknown` rather than `0`.

`models/client/partner/` was run against a fixture covering every skip reason
and both roster states before this shipped — 23 assertions, including that a
shared number never reaches the wire and that an unread roster yields
`known: false` rather than a confident zero. `tsc` has no opinion on any of it.

### Exercised against live data, 2026-09-21

Both apps run locally against their real Supabase projects (`CLAUDE.md` has the
port and stub setup; `scripts/bridge-demo.mjs` seeds and removes the dummy
rows). What was confirmed, in that order:

| Checked | Result |
|---|---|
| Missing / wrong `x-sync-key` | 401 both times |
| No token, malformed token, expired token | 401 each; a `retail` caller and an off-roster user 403 |
| Seven POST validations | All reject before relaying — the roster was re-read to prove nothing arrived |
| First push of two dummy firms | `created: 2`, `credentials_issued: 0` |
| Identical re-push | `updated: 2`, still two rows — idempotent |
| Re-push with a changed `firm_name` | **Name unchanged on the partner side.** The firm owns its profile |
| A different client on a linked number | `linked_elsewhere`, skipped |
| A linked id arriving on a new number | `phone_conflict`, skipped |
| `promote` (login + referral + approved order) | Column flips to **Power user**, tiles read 2 and ₹5.00 L |
| Partner app unreachable | Tiles read **Unknown**; all 41 rows read **Unknown**, none read "not on Studio Sales" |

The last row is the one worth re-running after any change here. An outage that
renders as "no firm is linked" is a sentence somebody acts on.

Against the real 41 clients the modal offers **27 of 41**, and every exclusion
reason fires on real rows — including two clients that share one contact
number, which is exactly the pair that would otherwise pay the wrong firm.

**Nothing has been pushed to production.** The dummy rows above were created
and removed; the 27 real firms are still unprovisioned.

### What still has to be built

Ordered by what unblocks what, not by size. The first two are small and the
bridge is half-useless without them.

**Next — finish P1 so it is actually usable**

1. **Set the two env vars.** `PARTNER_APP_BASE_URL` and `PARTNER_SYNC_SECRET`
   are in no Azure portal. The route 503s naming the missing one, which is how
   to check a deploy picked them up.
2. **Deploy the partner side first**, then this one. The other order is a CRM
   button calling a 404 in production, and in both repos a merge to `main` is
   the deploy — there is no staging step to catch it.
3. **A way to push a subset.** `planPartnerPush` reads the whole client list, so
   the first press provisions all 27 eligible clients at once and the search box
   does not narrow it. Change the modal's plan, not the route.
4. **The nightly trigger.** Azure Static Web Apps has no scheduler, so the
   manual button shipped first, as planned. A GitHub Actions workflow calling
   the same route replaces it. Do not build a cron on Azure for this. Pressing
   the button twice is safe — every write is keyed on the client id.

**Then — the order and event producer**

5. `POST /api/sync/referrals` on the partner app is written, idempotent and
   **fed by nothing**. Until something pushes to it a provisioned firm signs in
   to an empty dashboard, `delivered_on` and `discount_availed` stay null, and
   the whole incentive programme has no input. The payload rules below are for
   that route, not for the provisioning one. This is the single highest-value
   piece left.

**Then — the five remaining linkage surfaces**

6. **A decisions endpoint on the partner side.** Referral, order, portfolio and
   team approvals are console UI actions today, not an API, so none of them can
   move here until they are exposed. It must be a named list of operations —
   approve this order, approve this referral, assign this BM — and never a
   general query proxy, or the trust boundary above is gone with nothing on
   screen to show it.
7. **The visits queue.** `GET /api/sync/outbox` and
   `POST /api/sync/visit-assignment` are both built and live on the partner side
   and have never been called. `VisitLog` there already renders the assigned BM
   the moment the endpoint sets them, so this side is the only work.
8. **A KAM's link to a firm's own dashboard.** `/console/partners/[id]/dashboard`
   exists and adds no policy — deep-link it rather than rebuilding it, so the
   figure an admin reads down the phone is the figure the architect is looking at.

**Then — the team's own tabs**

9. Round-robin allocation of inbound leads, with three states: allocated by us,
   already owned in Kylas, unallocated. Never quietly give an unallocated lead
   to the first name in the list.
10. Role-gated sub-tabs for the four kinds of people, keyed on the Django user id
    or work email — **never the display name**, which is what `B2B_ROSTER` is
    keyed on today. A gated tab must name the role that opens it; a structural
    difference nobody can see is what got the partner-side workspace retired.
11. **§7's handoff record and checklist** — the one hard gate in the whole
    design — and §10's onboarding form and credential chain.

Constraints the payload must carry over, each one already paid for elsewhere in
this repo:

| Field | Rule |
|---|---|
| `orders[].md_enq_id` | Case preserved on the wire (`wireEnqId`), uppercased only for local comparison. It is the idempotency key on both sides |
| `orders[].order_value` | From the deal ticket, **never** a typed estimate. Three boards here have shipped the bug where a rep's guess was summed as realised revenue — an estimate must not cross this wire at all |
| `orders[].ordered_on`, `.store` | **Omit the key** when unknown rather than sending `null`; an explicit null clears the column on the partner side |
| `events[].external_id` | The source row's own id, prefixed by type. Never `` `X-${Date.now()}` ``. The field apps log one arrival up to twenty times — see the duplicate-log-writes landmine |
| `events[].phone` | Normalised to the last 10 digits, matched **exactly**. Django's `?q=` is a substring match, so a 10-digit number also returns tickets raised under a longer string that contains it (`91<number>123`) — a different client. Drop non-exact rows and count the drops |

Provisioning matches on **phone, exactly, and nothing else**. A firm whose phone
already carries a different `md_client_id` is skipped and reported, never
merged — the same three-outcome rule (matched / no match / ambiguous) the
referral route already enforces, for the same reason: getting it wrong pays the
wrong architect.

### Decisions taken on the PRD's §12, so they are not re-argued

All overrulable; none is expensive to change.

- **Zone = the existing EC/branch list** (`fetchBranchList`), not a new
  geography. `EcPicker` already binds BMs to branches.
- **A zone with no BM** keeps its leads, surfaced in an unowned bucket. Never
  auto-reassigned.
- **Missed targets are measured, not policed** — shown on the rollup with the
  shortfall named, no auto-escalation until someone owns the notification.
- **Two BMs on one company**: reuse `findDuplicates`. Shared phone or GST is
  evidence; a similar name is not. The system never merges them.
- **Stale follow-up**: 30 days with no completed meeting flags it stale. Never
  auto-lost.
- **Segment 1/2/3** is the existing `SEGMENTS`. Confirm with KK, but do not
  create a second vocabulary either way.
- **Catalogue approval**: no SLA, no auto-approve; the queue shows each
  request's age. A rejection may be resubmitted, keeps its reason, and does
  **not** flag the lead. Capture quantity, not cost.
- **Handoff SLA**: the meeting must be *scheduled* within 3 working days of
  close. Shown as overdue; does not block, because the order is already placed.
- **An incomplete checklist means "Handoff pending", not handed off.** This is
  the one hard gate in the design — §7 is the only place the PRD writes "cannot
  be skipped" and "all items required". Hard-gate what a document names as
  required and no more; that is the same rule `kamOrderGateErrors` follows.
- **The 12-day meter is account-level**; a secondary KAM may log against it. No
  auto-reassignment on leave. **Amber at 9 days, red at 12+.**
- **Reactivation**: a new order or a logged meeting restores Active; the §9
  volume tier stays order-driven only.
- **Only the PIC and Alternate PIC** get logins. Already enforced —
  `partner_user` has no self-serve insert policy.
- **Commission is tracked, not paid.** `reward_claim` already separates "tier
  reached" from "handed over".
- **Build the Admin/MD rollup** — zone × BM target-vs-achieved, KAM account
  health, approval turnaround. Without it the targets are collected and never
  read.

### Build order

**P1 the bridge — DONE 2026-09-21**, except for running it: the routes, the
button and the read-back are built, and nobody has pressed it against
production yet. Migration 003 turned out to be unnecessary (`md_client_id` was
already there). **Provision the rows, gate the credentials** held: the push
creates firms and no logins.

**P2 the handoff gate** — §7's handoff record and checklist, the §8 meter, §9's
tiers.

**P3 zones and the meeting week** — §3, §4, §5's two fields, §6, and the rollup.

**P4 credentials and the return leg** — the §10 form and approval chain (note
the partner project has email confirmation **on**, so issuing a login is a
Supabase admin invite, not a signup link), pulling architect-raised referrals
back here as inbound leads, and the nightly trigger.

### Two things that will bite whoever builds it

A committed migration is **not** an applied one — neither repo runs its own SQL,
both are pasted by hand, and this Supabase ignores `Prefer: tx=rollback`, so a
"rollback" probe leaves a real row to delete. And the ten-request budget applies
to the partner app's Clients tab too: the order figures come from one batched
call, the way `views/client-db/index.tsx` already does it — never one request
per row.
