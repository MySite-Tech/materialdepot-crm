# Four backends

**Covers:** `lib/api/** · lib/server/b2b-backend.ts · lib/b2b/data/backend.ts · components/site-audit/shared/sb-client.ts · supabase/migrations/`

## Purpose
The four backends this app talks to, which is which, and the env/migration facts that go with them.
This is the single most common source of confusion here.

| What | Where | How it's reached |
|---|---|---|
| **Employees, permissions, auth, leads** | Django, `https://api-dev2.materialdepot.in/apiV1` | `lib/api/core/client.ts` (`mdFetch`), re-exported from the `lib/api/index.ts` barrel |
| **B2B sales CRM data** | FastAPI `b2b-backend` → `newdb` Postgres on `psql-md-prod-cin-01` | Browser → `lib/b2b/data/backend.ts` → `app/api/b2b/[...path]` route handler (`lib/server/b2b-backend.ts`: `requireCaller` + `canUseB2B`, the same B2B Sales rule as the tab gate) → FastAPI, trusted by `x-sync-key: B2B_BACKEND_SECRET`. Env: `B2B_BACKEND_URL` + `B2B_BACKEND_SECRET`, **server-only** (route handler), so like the other server-only keys they are NOT in the deploy workflow — set them in Azure application settings. See `docs/b2b/data-layer.md` |
| **CRM's own Supabase** | project `olkkioacgccgsjjlmbhc` | Route handlers only, `SUPABASE_SERVICE_ROLE_KEY` via `lib/appointments/rota-plan.ts` and `lib/store-checklist/checklist-store.ts`, which bypass RLS. **No longer reached from the browser** — `lib/supabase.ts` (the anon client, used only by `lib/b2b/**`) was deleted when B2B moved to the FastAPI backend above. `b2b_lead`/`b2b_target` are retired there |
| **Site Audit / field-app Supabase** | project `jqrdfnjfxqxrazfkaofm` | `components/site-audit/shared/sb-client.ts` — `sbGet`/`sbPost`/`sbPatch` |

Gotchas:

- **Both base URLs live in `lib/api/core/config.ts` and nowhere else.**
  `MD_API_BASE_URL` resolves `NEXT_PUBLIC_API_BASE_URL` → `API_BASE_URL` →
  the dev2 default; `KYLAS_API_BASE_URL` resolves `NEXT_PUBLIC_KYLAS_API_BASE_URL` →
  `KYLAS_API_BASE_URL` → the Kylas default (the `NEXT_PUBLIC_` one moves the
  browser's calls too; `npm run dev:sandbox` uses it). They were previously copy-pasted across seven and fifteen call
  sites respectively, and one route (`app/api/kylas/sync-estimate`) had drifted
  onto a *different* host (`api-dev`, not `api-dev2`) via its own
  `MD_BACKEND_URL` var, which is why nobody could answer "which backend does the
  CRM talk to" from one place. Point a new environment by setting the env vars,
  not by editing a call site.
- The precedence order is deliberate: only `NEXT_PUBLIC_`-prefixed vars are
  inlined into the browser bundle, so **`API_BASE_URL` alone still cannot move
  browser calls** — it is read by route handlers (server side) only. To move the
  whole app you must set `NEXT_PUBLIC_API_BASE_URL` *at build time* in the deploy
  workflow, which today injects only the two `NEXT_PUBLIC_SUPABASE_*` secrets.
  Setting it in Azure application settings is too late: the browser value is
  baked at build, not read at runtime.
- **The flip side bites locally: `API_BASE_URL` alone splits the app in two.**
  On 2026-10-29 `.env.local` had `API_BASE_URL=http://127.0.0.1:8000/apiV1` (a
  local Django, not running) and no `NEXT_PUBLIC_` override. The browser logged
  in against `api-dev2`, the server checked that token against `:8000`, and
  every B2B call threw "Could not reach the backend to verify this session" in
  the dev overlay. `requireCaller` must verify against the Django that issued
  the token, so set both vars or neither.
- **Real B2B data on `npm run dev` needs `B2B_BACKEND_URL` and
  `B2B_BACKEND_SECRET` in `.env.local`.** They are not on this machine; the
  values live in the Azure application settings (the backend's own copy is
  `SYNC_SHARED_SECRET` in its K8s secret). Without them every B2B route answers
  503 "B2B_BACKEND_URL is not set". `npm run dev:sandbox` sets its own and needs
  neither.
- **`SUPABASE_SERVICE_ROLE_KEY` and `KYLAS_API_KEY` are server-only and are NOT
  injected by the deploy workflow** (it passes just the two `NEXT_PUBLIC_SUPABASE_*`
  build-time secrets). A route handler that needs one reads it from the Azure
  Static Web Apps *application settings* at runtime, which live in the portal and
  are invisible to this repo. So a new service-role route can typecheck, build and
  work locally and still throw `SUPABASE_SERVICE_ROLE_KEY is not set` in
  production — confirm the setting exists rather than inferring it from the
  workflow file. Tables reached this way (`rota_plan`, `store_checklist`) have RLS
  on with no policy, so the anon key is not a fallback: if the key is missing the
  feature is down, not degraded.
- `components/site-audit/shared/sb-client.ts` hardcodes the Site Audit URL **and** anon key too.
  Nothing reads `NEXT_PUBLIC_SITE_AUDIT_*`, so those two keys were dropped from
  the env file; re-add them only if you also make that module read them.
- The Site Audit project is shared with the separate `material-depot-site`
  vanilla-JS PWA and **runs with RLS off** — its anon key is public by design.
  Do not "fix" that by enabling RLS; it breaks every read in both apps.
- Two Supabase projects means "the profiles table" is always the Site Audit one.
  Migrations like `site-audit-migration-001-branch-column.sql` must be run
  against `jqrdfnjfxqxrazfkaofm`, not the CRM project.
- Every `.sql` file lives in `supabase/migrations/`, and its filename prefix is
  the only thing saying which project it targets. `supabase/migrations/README.md`
  is the index: target project per file, plus which ones were never actually
  applied. New DDL goes in that folder — nothing runs it, so say in the PR that
  it still needs pasting into the right SQL Editor.

## B2B is off Supabase entirely (2026-10-29)

PR #27 moved the four B2B pipelines and `b2b_target` to the FastAPI backend. The
revamp branch then moved the last two B2B tables with it: the team roster
`b2b_team_member` and the inbound assignment log `b2b_lead_assignment`
(`supabase/migrations/b2b-team.sql` was never applied and is superseded).
`lib/server/b2b-team/store.ts` now calls the backend server-to-server through
`b2bBackendFetch` (`lib/server/b2b-backend.ts`) with the same `x-sync-key`.

That needs **b2b-backend migration `0020_b2b_extra_and_team`** (branch
`b2b-crm-extra-and-team`), which also adds an `extra` jsonb column to the four
B2B tables. **Deploy it before this CRM branch.** Until it runs, the backend
answers 404 on `/b2b/team`, the store reads that as `TeamTableMissing`, the
Team tab says so and the round robin skips. Every inbound lead then stays with
Hardi, which is what the user saw on 2026-10-29.

**Migration `0021_b2b_admin_and_ec_visit`** (in b2b-backend PR #13 with 0020,
branch `b2b-crm-extra-and-team`, pushed 2026-10-29) adds `b2b_team_member.is_admin` and the `b2b_ec_visit` table with
`GET/PUT /b2b/ec-visits`. The CRM reads both gracefully without it: a missing
`is_admin` reads as false. 0020 and 0021 are live since 2026-10-29.

**Migration `0023_b2b_teams_and_ec_redirect`** (b2b-backend branch
`b2b-team-ownership-checkin` (merge #15 then #16; #14 goes inside #16, see `CLAUDE.md` §Git), based on PR #15's `studio-staff-handoff` because
it chains after 0022):
- It moves `b2b_team_member`'s key to `(phone, team)`, so one person can be on
  several teams.
- It adds the redirect columns to `b2b_ec_visit` (`b2b/ec-directed.md`).
- The same branch adds `POST /b2b/check-in-photo`. The CRM stopped calling it on
  2026-10-31, when the check-in photo was removed (`b2b/kam.md`), so it is unused.

0001→0023 and a 0023 downgrade/upgrade round trip were run on 2026-10-30 against
a throwaway embedded Postgres (the `ss-bill-rig` binaries). The new routes were
exercised over HTTP there. Without 0023:
- the Team tab cannot put one person on a second team: the upsert conflicts on
  `phone`;
- EC Directed reads Unknown;
- check-in uploads fail, so a held meeting cannot be saved.

## Owed by Django (2026-10-30)

Collected from every module doc on 2026-10-30. None of it is checked against
Django's code: the repo (`MaterialDepotDjangoBackend`) is not on this machine,
and who changes it is still open. Each row names the doc with the detail.

| # | Change | Wrong or missing until then | Detail |
|---|---|---|---|
| 1 | `b2b-bulk` `histories[phone].lastOrderDate` = `max(estimate.order_placed_time)` over placed, non-deleted estimates (revenue from the same call disagrees with Metabase too) | Active/Inactive, lens counts and KAM revenue for any firm with an open deal; the CRM shows those as Status unknown | `b2b/client-db.md` §The list |
| 2 | `b2b-bulk` GST matching: `gsts=` (exact, never `icontains`), `include=tickets`, GST keys in `histories` | Orders billed to a firm's GSTIN from a number not on the firm (253 GSTINs span several accounts); one request per phone on a firm open | `b2b/sales-tab-redesign.md` §Django contract |
| 3 | `gst=` filter on `/crm/leads/` (covered by 2 if built as specced) | Enquiries cannot be found by GSTIN | `b2b/client-db.md` §GST |
| 4 | Order detail by enquiry id: qty, rate, PI, payment, delivery (as Procurement shows) | An expanded enquiry shows item names only. Not yet asked of the Django team | `b2b/client-db.md` §One enquiry |
| 5 | `/crm/leads/` drops `branch` on some requests (likely when `bm=` is also sent) | A B2B-only rep's carts read as a retail branch's leads; the CRM shows an amber notice | `landmines.md` (the Leads-tab BM entry) |
| 6 | `/crm/available-bms/?branch=` returns anyone linked to the branch, not people homed there | Nothing on screen (the CRM reconciles against the roster); wrong for any other caller | `weekly-funnel/context.md` |
| 7 | Permission rows for `team_leader`, `asst_store_manager`, `cluster_head`, `area_manager` | Those rungs of the store ladder stay empty | `org-hierarchy/context.md` |
| 8 | Per-phone orders in bulk with `orderPlacedAt` (`estimate.order_placed_time`) and the booked-at branch (`estimate.branch_id`), e.g. `b2b-bulk?include=orders` with an `echo` | Sales by SPoC exists per firm only, split by Created, with no all-firms roll-up; the Firm page shows Created instead of a placement date; EC-directed revenue is checked per redirect on click and matched on the cart owner's branch | `b2b/ec-directed.md`, `b2b/client-db.md` §One enquiry |
| 9 | A per-customer footfall read: `contacts=` on `/footfall-record/` returning `{phone, branch, visitedAt}` | EC redirects are marked Visited by hand | `b2b/ec-directed.md` |

Data fixes, no code: Branch Access for B2B reps who carry retail stores (Admin >
Users), and backfilling `crm.remarks_quality` on existing permission lists.
Optional: a store code on each branch would retire the hand-kept maps in
`store-display` and `store-checklist`.

Studio Space sign-in from the CRM needs **no** Django change: the CRM verifies
its own session against Django and b2b-backend issues the Studio Space one
(`b2b/studio-space.md` §One login).

