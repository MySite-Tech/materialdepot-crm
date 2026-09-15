*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The partner bridge: DESIGN ONLY, nothing here is built yet

**Status 2026-09-14: none of this exists in code.** It is the agreed shape for
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
| §10 | Onboarding form → Admin → MD → dashboard provisioned | **Missing. This is the bridge to the second app** |
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

### What has to be built, exactly

1. **`POST /api/sync/partners`** on the partner app — a mirror of the referrals
   route: same `x-sync-key`, same service role, same `defined()` partial-write
   rule. Plus migration `003`: `alter table partner add column md_client_id text
   unique`, so a CRM row and a partner row are **linked**, never name-matched.
2. **`app/api/b2b/partner-push/route.ts`** here — the producer. Must call
   `requireCaller` and be admin-scoped: it holds the partner project's shared
   secret and anything under `app/api/*` is reachable by whoever can reach the
   app. It reads the two calls the Client Database tab already makes and
   reshapes them.
3. A **"Push to partner dashboards" button** on the Client Database tab. Azure
   Static Web Apps has no scheduler, so the manual button ships first and a
   nightly GitHub Actions workflow calling the same route replaces it. Do not
   build a cron on Azure for this. Pressing it twice is safe — every write is an
   upsert.

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

**P1 the bridge** — `/api/sync/partners` + migration 003, the producer route and
its button, provision the 26 firms (logins stay off), and the Material Depot
columns on the partner app's Clients tab. Nothing in P1 waits on §7 or §10:
those 26 firms have valid phones today. **Provision the rows, gate the
credentials.**

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
