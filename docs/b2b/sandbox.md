# B2B sandbox (`npm run dev:sandbox`)

A local copy of the whole B2B lead journey on dummy data: Inbound (Kylas lead,
calls, client details, Send to Outreach), Outreach (accept, meetings, handover),
KAM. In production every step writes to a real system, so the journey cannot be
clicked through there. Here the three B2B systems are stubbed by one Node
process, so **saving is safe** — the one place in this repo where it is.

```bash
npm run dev:sandbox            # stub on :4000, app on :3100
npm run dev:sandbox -- --reset # reseed the dummy data
node scripts/sandbox/index.mjs --stub-only   # stub only; prints the env to start the app with
```

A second `next dev` in the repo directory exits, so run it from the APFS clone
described in `CLAUDE.md` (§Looking at a screen). State is kept in
`.sandbox/state.json` (gitignored) under the directory it is started from, and
every non-GET request rewrites it, so a restart keeps your clicks. The stub
still answers Kylas `POST /call-logs/` and `POST /notes/relation`, which the CRM
no longer sends. The seed is
relative to the moment it runs: "today", "after 7 pm" and "6 days ago" are
recomputed on `--reset`.

## Personas

Log in with the phone and any four-digit OTP. Any other phone logs in as a local
`admin`.

| Phone | Name | Role | B2B team | Kylas user |
|---|---|---|---|---|
| 9000000001 | Asha (Inbound) | `b2b_sales` | inbound, in rotation | 990001 |
| 9000000002 | Bharat (Inbound) | `b2b_sales` | inbound, in rotation | 990002 |
| 9000000011 | Omkar (Outreach) | `b2b_sales` | outreach | — |
| 9000000021 | Kavya (KAM) | `b2b_KAM` | kam | — |
| 9000000099 | Meera (B2B Manager) | `b2b_manager` | — (manager) | — |

Kylas also has Hardi (`81181`, the intake owner), and Django has three EC BMs
(`9000000031–33`, JP Nagar / Whitefield / HSR) for the BM pickers and deal
tickets. They can log in too, which is how to try the EC B2B Referral form. `/crm/user-profile/` and `/user-organisation/` answer from the same
list, which is what keeps the tab gate and `requireCaller` in agreement.

## What is stubbed, and what is still real

| System | Env the app is started with | Stub path |
|---|---|---|
| Django | `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | `/apiV1` |
| FastAPI b2b-backend | `B2B_BACKEND_URL`, `B2B_BACKEND_SECRET=sandbox` | `/b2b-backend/b2b/...` |
| Kylas (browser and server) | `NEXT_PUBLIC_KYLAS_API_BASE_URL`, `KYLAS_API_BASE_URL`, `KYLAS_API_KEY=sandbox` | `/kylas/v1` |
| Studio Space partner app (content sync only) | `PARTNER_APP_BASE_URL`, `PARTNER_SYNC_SECRET=sandbox` | `/partner` |

`NEXT_PUBLIC_KYLAS_API_BASE_URL` exists for this: the browser's Kylas calls
(`kylasFetch`) cannot see the server-only
`KYLAS_API_BASE_URL`.

**Still real:** both Supabase projects. No B2B screen uses them, but other tabs
(Site Audit is on every B2B role) read them. `SUPABASE_SERVICE_ROLE_KEY` is set
to `sandbox-disabled`, so the server-side Supabase writers (store checklist,
rota plan) fail instead of writing production rows. Google Fonts loads from the
internet.

The backend stub stores rows generically: `meta_data` is kept whole, whatever
keys it carries, and replaced on upsert, as a jsonb column would be. Inbound
upserts on `kylas_lead_id`, the other pipelines on `pipeline + id`. A second
`round_robin` assignment for one lead answers 409. Unknown Django paths answer
`200 []`, never 401. Unknown Kylas paths answer an empty page.

## The journey, system by system

| Step | Production source | Answered here by |
|---|---|---|
| Lead arrives, list and detail | Kylas `POST /search/lead`, `GET /leads/{id}` (raw field names, see `inbound.md` §Kylas field names) | Kylas stub: honours the owner, pipeline, stage, `createdAt` and text rules of `b2bInboundRule` |
| Round robin off Hardi | Kylas `PATCH /leads/{id}` `/ownerId` + backend `/b2b/assignments*`, `/b2b/inbound/worked`, `/b2b/team` | Kylas and backend stubs; the owner change reads back |
| Presales notes and calls | Kylas `/notes/relation`, `/call-logs/search`, `/call-logs/{id}` | Kylas stub, seeded on two leads |
| B2B calls (RNR / Connected), client details, status, team notes, Send to Outreach | backend `POST /b2b/rows` (pipeline `inbound`). Nothing is written to Kylas since 2026-10-29 | backend stub |
| Enq ID and deal tickets | Django `/crm/leads/?enquiry_ids=` and `?q=<phone>` | Django stub, seven `ENQ-9001xx` tickets |
| BM / EC pickers | Django `/crm/available-bms/`, `/orgainsation-branch/` | Django stub |
| Outreach pool, accept, meetings, handover | backend rows (pipeline `outbound`, id `OR-IN-<kylas id>`) | backend stub |
| Studio Space waitlist | backend `GET /b2b/waitlist` | backend stub, two sign-ups: one on Mockup Interiors' mobile (Waitlist tile 1), one matching no lead |
| Studio Space access | backend `GET /b2b/studio-access` | backend stub: up to four logins from the seeded clients, plus one studio matching no client, which raises the amber notice on Numbers by firm. The first studio carries one order and one referred client. `POST /b2b/studio-number` is accepted and stores nothing |
| Overview revenue channels | `/api/b2b/revenue` → `/crm/leads/`, backend `GET /b2b/studio-access` | stub filters by `order_from`, `order_to` and `branch` when `branch_basis=estimate`; seeded with one Direct KAM, one Direct Inbound, one referred and one partner-team order |
| Studio Space sign-in | backend `POST /b2b/staff-handoff`, `GET /auth/handoff` | backend stub: Kavya and Meera get a code, everyone else a 404. The frame shows a JSON line naming who would be signed in, not the console |
| EC visits (Firm page, Appointment Tracker) | backend `GET/PUT /b2b/ec-visits` | backend stub |
| KAM firms, orders, last-order status | backend rows (`client`, `kam`), `/b2b/kam-load`; Django `/crm/leads/b2b-bulk/`, `/client-order-history/` | backend and Django stubs |

## The seed

Seventeen Kylas leads (`7000101–7000117`, phones `90000100xx`): three still on
Hardi (before 7 pm today, after 7 pm, and earlier today) for the round robin; one
freshly assigned; RNR runs of 1, 2, 3 and 5 over the last week; one Connected
with team and Presales notes; Follow up; PI Shared on `ENQ-900101`; Closed on
`ENQ-900102`; Lost; Invalid; one sent to Outreach and still in the pool; one
accepted into Outreach (`OR-IN-7000116`, a meeting held and one booked); one
waiting for Omkar's sign-off (`OR-IN-7000117`). Outreach also has a converted
lead with a handover pending on Kavya and one she accepted, which became the
client `CLI-SBX-0001`; `CLI-SBX-0002` last ordered 45 days ago.
`CLI-SBX-0001` has one EC visit booked at Whitefield for tomorrow
(`ECV-SBX-0001`), so the Firm page card and the Appointment Tracker's B2B list
both have something to show. Every name, firm
and phone is invented — `origin` is public.
