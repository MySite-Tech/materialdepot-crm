# Three backends

**Covers:** `lib/api/** · lib/supabase.ts · components/site-audit/shared/sb-client.ts · supabase/migrations/`

## Purpose
The three backends this app talks to, which is which, and the env/migration facts that go with them.
This is the single most common source of confusion here.

| What | Where | How it's reached |
|---|---|---|
| **Employees, permissions, auth, leads** | Django, `https://api-dev2.materialdepot.in/apiV1` | `lib/api/core/client.ts` (`mdFetch`), re-exported from the `lib/api/index.ts` barrel |
| **CRM's own Supabase** | project `olkkioacgccgsjjlmbhc` | From the browser: `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` via `lib/supabase.ts` — only `lib/b2b/**`. From a route handler: `SUPABASE_SERVICE_ROLE_KEY` via `lib/appointments/rota-plan.ts` and `lib/store-checklist/checklist-store.ts`, which bypass RLS |
| **Site Audit / field-app Supabase** | project `jqrdfnjfxqxrazfkaofm` | `components/site-audit/shared/sb-client.ts` — `sbGet`/`sbPost`/`sbPatch` |

Gotchas:

- `API_BASE_URL` in `lib/api/core/client.ts:1` is **hardcoded**, so editing
  `API_BASE_URL` in the env file changes nothing *for browser calls*. It is not
  dead, though: `app/api/store-display/route.ts:5` reads
  `process.env.API_BASE_URL` (falling back to the same dev URL). Don't delete
  the var — one server route depends on it.
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
