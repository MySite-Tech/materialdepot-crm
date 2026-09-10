# Three backends

**Covers:** `lib/api/** · lib/supabase.ts · components/site-audit/shared/sb-client.ts · supabase/migrations/`

## Purpose
The three backends this app talks to, which is which, and the env/migration facts that go with them.
This is the single most common source of confusion here.

| What | Where | How it's reached |
|---|---|---|
| **Employees, permissions, auth, leads** | Django, `https://api-dev2.materialdepot.in/apiV1` | `lib/api/core/client.ts` (`mdFetch`), re-exported from the `lib/api/index.ts` barrel |
| **CRM's own Supabase** | project `olkkioacgccgsjjlmbhc` | `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`, via `lib/supabase.ts` (only `lib/b2b/**` uses it) |
| **Site Audit / field-app Supabase** | project `jqrdfnjfxqxrazfkaofm` | `components/site-audit/shared/sb-client.ts` — `sbGet`/`sbPost`/`sbPatch` |

Gotchas:

- `API_BASE_URL` in `lib/api/core/client.ts:1` is **hardcoded**, so editing
  `API_BASE_URL` in the env file changes nothing *for browser calls*. It is not
  dead, though: `app/api/store-display/route.ts:5` reads
  `process.env.API_BASE_URL` (falling back to the same dev URL). Don't delete
  the var — one server route depends on it.
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
