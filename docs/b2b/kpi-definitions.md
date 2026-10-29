*Part of `docs/b2b/context.md` — see that file for the module overview. Feeds
the redesign plan at [`sales-tab-redesign.md`](sales-tab-redesign.md).*

## Source and status

Transcribed 2026-10-28 from the user's Google Sheet "Studio Team KPI"
(`1XPpg_gb0D2ftgIODLc0bBW9TCSxe2DbvWpONcQg9MzU`, `Sheet1`), and re-pulled the
same afternoon — the sheet had already changed (Inbound targets, the KAM
active-rate split, the team list). **It moves; re-pull before building.** **This is the
user's source of truth — the sheet may change; re-pull before trusting this
file if a session is more than a few weeks past the date above.** Nothing
here is implemented. These are the "new KPIs, roles and metrics" referenced
as the blocker in `sales-tab-redesign.md`.

Every KPI is **Per Head** (per BM/KAM) unless stated otherwise. "Efforts" =
activity that should be logged as it happens; "Output" = a result derived
from CRM data, not self-reported.

## Outreach

Re-pulled 2026-10-28 (rows 4–11) for the Outreach build: targets unchanged. The
sheet's extra "consideration" column adds, for the KAM handover row: KAM fills
the client account (primary contact, **procurement contact**, GST, address,
dashboard onboarding with Power User / Non-Power-User marking) and logs a first
meeting with who they met. That is KAM-side capture, not built in Outreach.
How each KPI is computed from CRM data is in `outreach.md` §KPIs.

| KPI | Type | Target | Unit | Frequency |
|---|---|---|---|---|
| New Leads Meetings (unique clients) | Effort | 50 | Leads | Per month |
| Follow-up Meetings (unique clients) | Effort | 30 | Leads converted | Per month |
| CRM Adherence | Effort | 100% | Data input | Real time |
| Coverage of Inbound-converted leads & EC referrals | Effort | 100% | Meetings | — |
| New Lead Conversion | Output | 15 | Leads converted | Per month |
| Studio Space Waitlist | Output | 30 | Sign-ups | Per month |
| Handover of Converted Clients (to KAM) | Output | 100% | Round-robin, KAM sign-off required | — |
| New Revenue from the 15 converted clients | Output | 5 | Lacs | Per month |

Non-obvious rules behind these numbers:

- **A "genuine lead" is validated by**: CRM log with owner details, contact
  number, meeting logs + follow-up date set, live map pin location, WhatsApp
  group creation. Mandatory capture: Company Name, Owner/Designer Name,
  Contact Number, Segment Classification, Client Type Classification, Office
  Address, meeting notes, next follow-up date. WhatsApp group link is "good
  to have," not mandatory.
- **A follow-up only counts once ≥2 follow-up meetings are logged** with
  notes and a next-follow-up date, continuing until either 2 are done or an
  order is placed.
- **Lead Conversion = first order placed**, validated by phone number, with
  ENQ ID and order details fetched and snapped into CRM, status flow
  PI Shared → Order Closed logged explicitly. **ENQ ID should auto-fetch
  order value/status in CRM**, not be hand-typed.
- **Waitlist sign-up validation**: the phone number on the waitlist must
  exactly match the BM's lead-capture phone number. A genuine signup is also
  cross-checked against whether that same lead already placed a first order
  under the same BM.
- **Handover to KAM**: round-robin assignment in CRM; only counts once the
  KAM signs off (accept status) within an agreed TAT (suggested **48h**).
  Handover payload: segment (Architect/Freelance/Interior Designer), team
  size, contact details, GST, address, full meeting history, project type +
  details, live map location.
- **Revenue attribution**: only confirmed orders from clients that BM
  converted that month, tagged to the BM in CRM. Matched by phone (may be in
  EC too). "5 Lacs per head" is **across all 15 converted clients combined**,
  not per client. New-onboarding test: no order placed by that phone in the
  past 6 months.

## Inbound

| KPI | Type | Target | Unit | Frequency |
|---|---|---|---|---|
| Coverage over new leads | Effort | 100% | % of new leads | Daily |
| Calls — new & follow-ups | Effort | 1500 | Calls | Per month, per head |
| CRM Adherence | Effort | 100% | — | — |
| Revenue | Output | 25 | Lacs | — |
| Qualified Leads for Outreach | Output | 30 | Round-robin to Outreach, sign-off required | — |

Non-obvious rules:

- **Coverage = leads with a logged touch ÷ leads assigned that day.** Every
  new lead must have ≥1 logged call attempt with an outcome by end of day —
  **"New" status must be empty (0) at end of day.**
- **Dead-lead automation**: minimum 5 calls within 7 days. If 5 calls are
  done and status is RNR or Connected, auto-move to a Dead Leads bucket; same
  if RNR status crosses that 7-day window without resolution. **This is an
  automated state transition the CRM must drive, not a manual mark.**
  Every call needs call notes, remarks, next-follow-up date in CRM.
- **CRM Adherence mandatory fields**: contact name, number, firm name,
  segment, city, source, GST (where available), address, same-day interaction
  log, current follow-up date, current lead status. Adherence % = leads with
  all mandatory fields + logs ÷ total leads handled.
- **Qualified Lead for Outreach** only counts after the **Outreach BM signs
  off** in CRM on the round-robin assignment. Qualification checklist:
  verified phone, decision maker identified, segment, active/upcoming
  projects, serviceable location, confirmed interest + preferred meeting
  slot, call notes attached. A rejected lead needs a reason captured, and
  rejections feed an Inbound quality score.
- **A qualified lead is only credited late**: Outreach can validate it only once
  the lead has converted, or Outreach has logged 2 follow-ups with it. So this
  KPI lags the handoff by weeks and a month's count keeps moving after month end.
- **Calls are 1,500 a month per head** (the user, 2026-10-29). This replaced
  the 90 a day confirmed on 2026-10-28. The sheet's "1500 per day" was the
  monthly figure under the wrong frequency.
- **Revenue includes orders placed at an EC** for a lead the inbound owner
  worked, not only orders the inbound rep closed themselves.
- **Dead-lead rule, as worded**: at least 5 calls within 7 days. If 5 calls are
  done and the call status is still RNR or Connected (i.e. never progressed to a
  lead stage), or if RNR persists past 7 days, the lead moves to Dead. Built
  2026-10-29 as **Ready to close** (`closureReadiness`, `inbound.md`): 5 RNRs in
  7 days, or 7+ days with 4+ calls and still New/Connected. It is not a status:
  the rep closes it as Lost with the matching reason. Attempts are uncapped.
- **Call statuses are two** (RNR, Connected) **and lead stages are separate**
  (Follow-up, PI Shared, Closed, Lost-with-reason) — matches today's split of
  `CallAttemptOutcome` vs `InboundStatus`.

## Key Account Management (KAM)

| KPI | Type | Target | Unit | Frequency |
|---|---|---|---|---|
| Account Meetings | Effort | 35 | Meetings | Per month per head, across assigned accounts |
| Meeting Coverage of Active Clients | Effort | 50% | % of active accounts | Per month |
| Handover of New Accounts | Effort | 100% | — | — |
| CRM Adherence | Effort | 100% | — | — |
| Calls | Effort | 500 | Calls | Per month, per head (user, 2026-10-29; was 40 a day) |
| New Handed-over Account Active Rate | Output | 100% | % of last month's handovers | MoM / QoQ |
| Old Active Account Rate | Output | 60% | % of accounts | MoM / QoQ |
| Revenue | Output | 50 | Lacs | — (EC, self and referrals all count) |
| Studio Space Onboarding | Output | 25 | % of assigned accounts on Studio Space dashboard | — |

Non-obvious rules:

- **Account Meetings** logged with date, account, attendees, live map
  pin/check-in, purpose, discussion notes, next follow-up date.
- **Meeting Coverage = unique active accounts met ÷ total active accounts
  assigned.** Repeat meetings with the same account **do not** add coverage.
  "Active" here must use the same definition as Active Account Rate below —
  do not let two different "active" definitions drift apart.
- **New-account handover**: KAM signs off in CRM; first meeting with
  owner/designer is mandatory. Sign-off captures who they met, contact
  details, email, whether a client dashboard was provisioned (and its link
  if so), and an active WhatsApp group link.
- **CRM Adherence**: account profile complete (contact, GST, address,
  segment, team size), every meeting/call logged same day with notes + next
  follow-up date, order/payment/credit updates recorded, Studio Space status
  current, handover sign-offs on time.
- **Active rate is two KPIs now, not one.** *New handed-over* = accounts
  Outreach handed over **last month**, target 100%, counted once each has its
  first order under the KAM. *Old* = every other assigned account, target 60%.
  Same definition of "active" for both, and for Meeting Coverage above.
- **Active Account Rate is computed automatically from order data, never
  manually set.** = assigned accounts with ≥1 confirmed order in the month.
  **Every account starts at zero at the start of each month** (not carried
  forward as "still active"). A new handover account only counts once it has
  its first order under that KAM. Inactive accounts carry a reason (sheet
  cuts off here — reason taxonomy not yet defined, ask the user before
  inventing one). Visualized MoM and QoQ.
- **Studio Space Onboarding**: only after a KAM meeting is scheduled with
  accounts that joined the Waitlist and have ≥1 order — in-person meeting
  with owner/designer is mandatory, onboarding demo, complete profile with
  signing details, kit handed over at first KAM meeting.

## Team members (Bangalore, per the sheet)

| Team | Members |
|---|---|
| Outreach | Vilok, Pratham |
| Inbound | Hardi, Vikas, 2 new joinees |
| KAM | Jadhav, Varun, 1 new joinee |

This does not match the code: `B2B_INBOUND_OWNERS` lists Hardi, Mandeep,
Praful, Vikas, Krishna and Vilok, and `B2B_ROSTER` has Vilok and Praful as
Outreach. Pratham and Varun appear nowhere in the repo.

## What this implies for the CRM data model (not yet built — flagged for the build-order steps in `sales-tab-redesign.md`)

These are facts extracted from the sheet, not design decisions — surfacing
them here so no future session re-derives them from scratch:

- **Several "Output" KPIs must be computed from existing order/call/meeting
  data, never hand-entered as a number.** Active Account Rate, Revenue
  (all three teams), and New Lead Conversion all explicitly say "validate
  from CRM data" / "auto-fetch via ENQ ID" / "calculated automatically, not
  manually." A rollup/KPI view must query the underlying tables, not read a
  KPI value someone typed in.
- **Round-robin assignment + sign-off is a recurring primitive across all
  three handoffs**: Inbound→Outreach (qualified lead), Outreach→KAM
  (converted client), each with its own TAT and payload. Today's "handoff"
  (per the redesign-plan audit) is a single dropdown field — these KPIs need
  it to become a real record with an accept/sign-off state and a TAT clock,
  not a status string.
- **Dead-lead auto-transition (Inbound, 5 calls / 7 days) is new automated
  logic**, not present in today's gates per `docs/b2b/inbound.md`. Needs its
  own design pass — don't bolt it onto `outreachGateErrors`/`kamOrderGateErrors`
  without checking whether the 7-day window should be calendar or business
  days.
- **New required fields surfacing repeatedly**: GST, Segment Classification,
  Client Type Classification, Team Size, live map pin/location, WhatsApp
  group link, Studio Space Waitlist/Onboarding status, Power User /
  Non-Power-User dashboard marking. Check which of these already exist on
  `ClientRecord`/`types/client.ts` vs. need adding before assuming a
  CRM Adherence % can even be computed.
- **CRM Adherence itself is a KPI for all three teams** and needs a single
  shared definition pattern (mandatory-field-completeness % + same-day
  logging %) — build it once, reuse across Inbound/Outreach/KAM views,
  per the "one number, one function" house style rule.
