*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## Staff come and go, and the roster used to be the only record

One field staff member exists twice and has to, because the two halves are
keyed differently — `profiles` (Site Audit Supabase, EMAIL-keyed) is what the
field PWAs log into, `UserOrganisation` (Django, PHONE-keyed) is what the CRM
logs into and the only table `/login-otp/?contact=` will send an OTP for.
`profiles.contact` is the sole bridge. `components/site-audit/staff/staff-directory.ts` is the one place that
writes both sides; `components/site-audit/staff/staff-modals.tsx` holds the three modals (add / retire /
restore) every surface shares.

**Adding.** There were two add-staff forms with separate role lists, separate
validation and separate hand-copied permission maps: the Audit dashboard's
offered Site Auditor and Auditor + Installer only, so an SM in the audit console
could not create a plain installer at all and had to know to cross to the
Install dashboard. Both are now `AddFieldStaffModal`, and it names the dashboard
the new hire will appear on — the two SM rosters are `site_auditor +
auditor_installer` and `installer + auditor_installer`, so adding an installer
from the audit console works and is meant to, but the person shows up on the
*other* screen and without that line the add read as a no-op.

**The permission map is DERIVED now, in one direction each.**
`SITE_AUDIT_ROLE_TO_PERMISSION` / `crmPermissionsForSiteAuditRole()` invert
`SITE_AUDIT_PERMISSION_TO_ROLE` instead of restating it. Three hand-written
copies of that table existed (`SiteAuditUsersView`, `audit-ops/Overlays`,
`install-ops/Overlays`) and one had already drifted — which is exactly how
`SITE_AUDIT_ROLES` and `defaultPermissionsForRole` broke twice (see Known
landmines). Add a role to `SITE_AUDIT_PERMISSION_TO_ROLE` and both directions
learn it at once.

**Removing is a SOFT delete, and the SM can do it.** It used to be `sbDel`,
admin-only, from one screen, and its own confirm text admitted the gap: it
deleted the field-app profile and left the CRM login alive. Two things followed —
nobody could answer "how many installers left this quarter" because the row was
gone, and because deletion was irreversible it was avoided, so the roster kept
people who had left months earlier and the assignment pickers went on offering
them jobs. `profiles.deleted_at` / `deleted_by` / `exit_reason`
(`site-audit-migration-004-staff-exit.sql`) replace it. `deleted_at is null` is
the ONLY predicate any read uses; the reason comes from the fixed
`EXIT_REASONS` list so the attrition breakdown can't fragment into fourteen
spellings of "resigned"; `deleted_by` gives an accidental removal an owner to
ask. Restore is one click and clears the reason.

**Neither migration has been run yet as of 2026-09-03** (re-probed after the
work was pushed: `daily_cap` and `deleted_at` both still answer 42703). So on
the branch today the Remove control is disabled with a tooltip naming the file,
the Former staff view is hidden, and caps still degrade to their defaults —
everything else works unchanged. Running
`site-audit-migration-004-staff-exit.sql` is what switches all of it on, and it
is additive and idempotent, so it can be run before or after the deploy. Note
the probe latches per page load, so anyone with the app already open needs a
refresh before Remove becomes enabled.

**Both column sets are probe-gated, and it is the same guard for the same
reason.** `rosterQuery(cols)` bundles `rosterSelect` (caps, migration 003) and
`activeStaffFilter` (exit, 004): PostgREST fails the WHOLE select with `42703`
on a missing column, and this is the query the assignment pickers and the public
kiosk's slots-left count depend on, so naming `deleted_at` unconditionally would
take out every roster in both field apps. Verified against the live DB on
2026-09-03, where the columns genuinely do not exist yet: the bare roster query
returns 200, the naive `&deleted_at=is.null` returns 42703. An *unknown* probe
answer (network blip) resolves to "absent" — pre-migration behaviour — never to
"present", which would turn a dropped request into an empty roster. **Never
write the filter inline; always append `activeStaffFilter()`.** `retireProfile`
throws `ExitColumnsMissing` rather than falling back to a hard delete: a hard
delete is not a degraded soft delete, it destroys the record being asked for.
The UI probes up front and disables Remove with a tooltip naming the migration.

**Which reads exclude people who have left, and which deliberately don't.**
Getting this backwards silently breaks historic data, so each keep-them site
carries a comment saying so:

| Excludes retired | Keeps retired |
|---|---|
| both SM rosters + assignment pickers | `FoamPayoutViews` pay rates (a leaver's final payout uses the same override) |
| the kiosk's availability + slots-left | `SiteAuditJobsView`'s email→name map (else a leaver's past jobs render with a blank assignee) |
| `SiteAuditLiveView` (a leaver has a stale pin, not a location) | `SiteAuditBranchManagerView`'s phone→profile identity map (else their historic orders unattribute) |
| `SiteAuditPerfView` (else a wall of zeros reads as "did nothing") | |
| Role Viewer's person picker, the kiosk's BM picker, shadower pools | |

`pickOwnProfile` also skips retired rows and returns null when they all are, so
someone marked as no longer staff cannot be handed a field dashboard even if the
Django deactivation (a separate write, which can fail alone) outlives the
removal. `ownProfileQuery` is async purely because of the probe — both callers
await the same function, so they still produce the same string and `sbGet`'s
cache still collapses them into one request.

**`AppUser.active` is not optional to check.** Retiring someone deactivates
their CRM login (`status: false`, never a delete — Admin > Users still needs to
manage the account and their past orders must keep resolving to a real name).
`_mapUserOrg` reads it back as `active`. Anything deriving ACCESS or a live
roster from `fetchUsers()` must filter `active !== false`:
`SiteAuditBranchManagerView` always did; `SiteAuditUsersView`'s CRM-link check
and `SiteAuditOpsView`'s BM picker did not, so a deactivated account still read
as "✓ CRM linked" and was still offered for new order attribution. Both fixed
2026-09-03. Note `lib/api/crm/users.ts`'s `updateUser` renames `active` → `status` on
the way out — the repo's name and the backend column differ, and before that
rename the key rode through untouched and Django ignored it, so deactivating an
account looked like it worked and changed nothing.

**Why people were "not reflected in our system".** A profile with a real phone
and no CRM login cannot be sent an OTP, so the person cannot sign into the CRM
at all however healthy their field-app profile looks (Mohd Musaddique,
`8318839661`, was exactly this: `installer`/wallpaper/Hyderabad, `contact` set,
passcode set, field app working, no `UserOrganisation` row). The systemic source
is the legacy PWA — all three of its add-staff forms write a `profiles` row and
nothing else, with no `contact` and no CRM user:
`SM_Install_Dashboard.html:3109`, `SM_Audit_Dashboard.html:2553`,
`Admin.html:707`. That is also why 14 live profiles have no phone number at all.
The Users tab's amber notice used to state the count and stop, leaving the only
fix buried inside one person's Edit form; it now lists exactly who and creates
the missing logins in bulk (or one at a time, from a Fix button on the row) with
the same two permissions a fresh add grants. **Anyone added through the legacy
apps will keep arriving in that list until those three forms are fixed** — and
per the field-ops split, that repo is read-only from here.
