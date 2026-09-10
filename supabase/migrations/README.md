# Supabase migrations

Every `.sql` file the CRM has ever needed, in one place. They are **not** run by
any tool — there is no Supabase CLI wiring in this repo. Each one is pasted into
a project's SQL Editor by hand.

## Two projects. Check before you paste.

This repo talks to two unrelated Supabase projects, and the filename prefix is
the only thing that says which:

| Prefix | Project | Env var |
|---|---|---|
| `supabase-*`, `b2b-*`, `rota_plan` | CRM — `olkkioacgccgsjjlmbhc` | `NEXT_PUBLIC_SUPABASE_URL` |
| `site-audit-*` | Site Audit — `jqrdfnjfxqxrazfkaofm` | `NEXT_PUBLIC_SITE_AUDIT_SUPABASE_URL` |

The Site Audit project is shared with the separate `material-depot-site` PWA and
runs with RLS off by design. "The `profiles` table" always means the Site Audit
one.

## A file being committed here is not evidence it was applied

This repo has shipped migrations nobody ran, more than once, and the features
that depended on them were inert in production while looking fine in the UI.
Probe the column before trusting a DB-backed feature.

| File | Project | Applied? |
|---|---|---|
| `supabase-schema.sql` | CRM | yes — legacy `leads` table |
| `supabase-users.sql` | CRM | yes — `users` table |
| `supabase-migration-002.sql` | CRM | yes — `client_type`, `property_type`, `architect_involved` |
| `supabase-migration-003.sql` | CRM | yes — `branches` + seed |
| `supabase-migration-004.sql` | CRM | yes — `activity_logs` |
| `supabase-migration-005.sql` | CRM | yes — composite PK `(id, client_phone)` + dedupe |
| `supabase-migration-006.sql` | CRM | yes — `users.allowed_branches` |
| `supabase-migration-007.sql` | CRM | yes — `b2b_lead`, all three boards |
| `supabase-setup-b2b_lead.sql` | CRM | yes — recreates `b2b_lead` |
| `supabase-setup-b2b_target.sql` | CRM | yes — `b2b_target` |
| `rota_plan.sql` | CRM | yes — one row per branch |
| `b2b-migration-inbound-status.sql` | CRM | **optional** — `normalizeStatus`/`decomposeLegacyStage` run on every read, so the board is correct whether or not this is ever run |
| `site-audit-migration-001-branch-column.sql` | Site Audit | yes — `profiles.branch` |
| `site-audit-migration-002-branch-mgr-role.sql` | Site Audit | yes — branch-manager role |
| `site-audit-migration-003-staff-caps.sql` | Site Audit | **NO** — probed 2026-09-03, both columns answered `42703 column does not exist`. Superseded: its statements are repeated inside 004 (`if not exists`) |
| `site-audit-migration-004-staff-exit.sql` | Site Audit | **NO** — staff exit is gated off in the UI until it runs. Running this one file fixes 003 too |

The "Applied?" column is a record of what was true when last checked, not a
live status. Re-probe rather than trust it.
