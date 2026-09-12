# lib/org (store hierarchy registry)

**Covers:** `lib/org/**`

## Purpose
One declarative model of the five EC stakeholders — who they are, who checks
them, and who is allowed to see their numbers. Added 2026-09-12 for the Report
Card revamp; it is deliberately not report-card-specific, because "who reports
into me" is the same question the Weekly Funnel and Footfall tabs will ask next.

Source of truth is the two decks in `~/Desktop/Material Depot`:
`EC Stakeholders Tasks.pdf` (the task/frequency/SOP/maker-checker grid) and
`Roles_and_SOP_Definition.pdf` (the same content as a deck, with the
maker–checker chain on slide 4 and the cart-value escalation on slide 5).

## The ladder, and the two rungs nobody occupies

| Stakeholder | `depth` | Checked by (SOP) | CRM roles that map to it |
|---|---|---|---|
| Business Manager (`bm`) | 0 | Team Leader | `sales` |
| Receptionist (`receptionist`) | 0 | Store Manager | `retail` |
| Team Leader (`tl`) | 1 | Store Manager | **none** |
| Assistant Store Manager (`asm`) | 2 | Store Manager | **none** |
| Store Manager (`sm`) | 3 | Area Sales Manager / Central | `store_manager` |
| Area Sales Manager / Central (`central`) | 4 | — | `manager`, `admin`, `superadmin`, `tech` |

**`tl` and `asm` have no CRM role and therefore no occupants.** Django's
permission table (`PERMISSION_ID_TO_ROLE` in `lib/api/crm/roles.ts`) has no
Team Leader and no Assistant Store Manager, and neither appears in
`ROLE_OPTIONS`. They are in the registry because the SOP defines them and
because a BM's checker *is* the TL — leaving them out would have meant either
inventing a different chain or pretending the SOP says something it does not.
Visibility still works with the rungs empty: a BM's chain is `tl → sm →
central`, and the SM is on it whether or not a TL exists. **If a
`team_leader` / `asst_store_manager` permission is ever added in Django, adding
the slug to `crmRoles` here is the whole change** — nothing else needs to know.

## Who may see whose report card

`canViewReportCardOf(viewer, subject)` is the one function. Three gates, in
order:

1. **Yourself, always** — matched on `normalisePhone` (last 10 digits), because
   `/user-organisation/`'s `user.contact` and `/crm/available-bms/`'s `contact`
   do not agree on the `+91` prefix. The old auto-pick in the report card
   carried a hand-rolled `replace(/^(\+?91)/, '')` for the same reason.
2. **Role** — the viewer's stakeholder must be in `viewersOf(subject)`, which is
   the subject's upward `reportsTo` chain **plus** its `alsoVisibleTo` list.
3. **Branch** — `allowedBranches` must intersect, case-insensitively. **An empty
   list on either side means "all branches", not "none"** — see
   `docs/landmines.md`.

`alsoVisibleTo` exists because the chain alone is not the org chart. The AM's
own tasks are "Review all carts of TLs and BMs" and "TL/BM performance review",
so the AM sees `bm`, `receptionist` and `tl` even though it checks none of them.
The chain is still what the UI prints under "Checked by" — those are two
different facts and merging them would put the receptionist under the TL, which
the SOP explicitly does not.

Peers are not visible to each other. Two `central` accounts (say an `admin` and
a `manager`) cannot open each other's card, because `central` is not in its own
`viewersOf` set. That is intended; it is also why `admin` did not lose anything
in the revamp — everyone else is below them.

A CRM role that maps to no stakeholder (`procurement`, `post_sales`,
`customer_success`, …) is neither a viewer nor a subject: `buildTeam` returns
`unmappedRole: true` and an empty `reports`, and the Report Card says so in an
amber notice rather than rendering an empty list.

## Things worth knowing

- **`buildTeam` drops `status === false`.** `fetchUsers` maps that to
  `active`, and an ex-employee on the roster would otherwise sit in every
  manager's team list forever.
- **Sorting is senior-first** (`STAKEHOLDER_ORDER`), then by name, so a mixed
  team reads SM → AM → TL → Receptionist → BM rather than alphabetically.
- **`normaliseName` is for display grouping and for the one exact-match join
  described in `docs/report-card/context.md`. It is not a fuzzy matcher** and
  must never become one — see the ambiguity handling there.
