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

**Migration `0021_b2b_admin_and_ec_visit`** (b2b-backend branch
`b2b-team-admin`, on top of `b2b-crm-extra-and-team`, local only as of
2026-10-29) adds `b2b_team_member.is_admin` and the `b2b_ec_visit` table with
`GET/PUT /b2b/ec-visits`. The CRM reads both gracefully without it: a missing
`is_admin` reads as false. **Neither 0020 nor 0021 has ever run against
Postgres.** There was none on this machine to try them on.
