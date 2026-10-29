# Four backends

**Covers:** `lib/api/** · lib/server/b2b-backend.ts · lib/b2b/data/backend.ts · components/site-audit/shared/sb-client.ts · supabase/migrations/`

## Purpose
The four backends this app talks to, which is which, and the env/migration facts that go with them.
This is the single most common source of confusion here.

| What | Where | How it's reached |
|---|---|---|
| **Employees, permissions, auth, leads** | Django, `https://api-dev2.materialdepot.in/apiV1` | `lib/api/core/client.ts` (`mdFetch`), re-exported from the `lib/api/index.ts` barrel |
| **B2B sales CRM data** | FastAPI `b2b-backend` → `newdb` Postgres on `psql-md-prod-cin-01` | Browser → `lib/b2b/data/backend.ts` → `app/api/b2b/[...path]` route handler (`lib/server/b2b-backend.ts`: `requireCaller` + the `admin`/`b2b_sales` gate) → FastAPI, trusted by `x-sync-key: B2B_BACKEND_SECRET`. Env: `B2B_BACKEND_URL` + `B2B_BACKEND_SECRET`, **server-only** (route handler), so like the other server-only keys they are NOT in the deploy workflow — set them in Azure application settings. See `docs/b2b/data-layer.md` |
| **CRM's own Supabase** | project `olkkioacgccgsjjlmbhc` | Route handlers only, `SUPABASE_SERVICE_ROLE_KEY` via `lib/appointments/rota-plan.ts` and `lib/store-checklist/checklist-store.ts`, which bypass RLS. **No longer reached from the browser** — `lib/supabase.ts` (the anon client, used only by `lib/b2b/**`) was deleted when B2B moved to the FastAPI backend above. `b2b_lead`/`b2b_target` are retired there |
| **Site Audit / field-app Supabase** | project `jqrdfnjfxqxrazfkaofm` | `components/site-audit/shared/sb-client.ts` — `sbGet`/`sbPost`/`sbPatch` |

Gotchas:

- **Both base URLs live in `lib/api/core/config.ts` and nowhere else.**
  `MD_API_BASE_URL` resolves `NEXT_PUBLIC_API_BASE_URL` → `API_BASE_URL` →
  the dev2 default; `KYLAS_API_BASE_URL` resolves `KYLAS_API_BASE_URL` → the
  Kylas default. They were previously copy-pasted across seven and fifteen call
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

## Pending: B2B data moving from Supabase to Django (reported 2026-10-28, NOT done in code)

On 2026-10-28 the user said the B2B data now lives on the Django backend and
the CRM should no longer need Supabase for it. **The code has not been
switched.** On that date every B2B read and write below still went to the CRM
Supabase, and `lib/api` had no Django endpoint for any of them. The only B2B
Django calls are `/crm/leads/`, `/crm/leads/b2b-bulk/` and
`/crm/leads/client-order-history/`.

| Data | Supabase table | Read / written in |
|---|---|---|
| Client Database firms, KAM orders, Outreach leads, the DB half of Inbound | `b2b_lead`, split by `pipeline` (`client` · `kam` · `outbound` · `inbound`) | `lib/b2b/data/reads.ts` (`fetchAllRows`), `lib/b2b/data/writes.ts` |
| Targets | `b2b_target` | `lib/b2b/stats/targets.ts` |
| KAM round-robin load | `b2b_lead` | `lib/b2b/leads/kam-load.ts` |
| Team identity / roster | `b2b_team_member` (service-role key) | `lib/server/b2b-team/store.ts` |

Out of scope for that move, and still on Supabase: Site Audit (its own
project), `store_checklist` and `rota_plan`.

Until this table is empty, **treat Supabase as the production store for B2B**.
Saving a firm, a number or a GSTIN writes `b2b_lead`, and the "never exercise a
SAVE path" rule in `CLAUDE.md` still applies. Doing the move needs the Django
endpoint for each row (path, envelope, write semantics) from the backend team.
It also needs the existing rows migrated, or a period reading both stores. The
switch point is `lib/b2b/data/`, because every view goes through
`fetchRows` / `upsert*`. When a row moves, delete it from this table, and
delete this section once the table is empty.
