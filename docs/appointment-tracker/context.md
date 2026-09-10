# components/appointment-tracker

**Covers:** `components/appointment-tracker/**` · `lib/appointments/**` · `app/api/appointments` · `app/api/resource-plan`

## Purpose
The presales appointment tracker: a day calendar of booked visits, receptionist
lists, a manager summary, an admin overview, and the weekly rota planner.

## Data — three sources, three mechanisms

| What | Where from | How |
|---|---|---|
| Appointments | Kylas leads | `fetchApptFeed()` → `GET /api/appointments` (this app's own route handler) |
| Rota plan | CRM Supabase table `rota_plan` | `GET/POST /api/resource-plan` → `lib/appointments/rota-plan.ts` |
| EC-ready state | **the viewer's own browser** | `localStorage` key `md_ec_ready` |
| Footfall counts | `/api/footfall` | rota planner only (`tracker/rota/data.ts`), keyed `"<date>|<slotKey>"` |

`fetchApptFeed(force)` hits the route handler, not Kylas directly; the handler
holds the `KYLAS_API_KEY` and a server-side cache. The response carries
`fetchedAt`, `cached` and `stale`, and `?refresh=1` forces a refetch — so
"updated N mins ago" in the UI is `ageLabel(fetchedAt)`, the age of the *server's*
copy, not of the page load.

`rota-plan.ts` builds its own Supabase client with **`SUPABASE_SERVICE_ROLE_KEY`**
and so is server-only — it bypasses RLS. One row per branch; the plan is
`{ version: 2, branches: { <branch>: { members, weeks } } }`, which replaced a
single JSON blob that used to live on Kylas lead 39871021's
`cfResourceplanjson`.

### EC-ready is per-device, and that is a real limitation

`loadEcReady` / `saveEcReady` read and write `localStorage.md_ec_ready` only.
Nothing is persisted server-side. So the ready / not-ready marks one receptionist
sets are **invisible to every other user and to the same user on another device**,
and `computeStats`' `ready` / `notReady` / `unmarked` counts are per-browser.
Both accessors swallow their exceptions, so a private window silently reports
everything as unmarked. If this ever needs to be shared, it needs a table.

## Derivations

- **Booked** = a lead with `cfVisitScheduled` set. Leads without it are skipped
  entirely by `computeStats` and `bookedVsVisitedByDate`, so they are not in any
  denominator.
- **Visited** = `convertedAt` is present. There is no separate visit flag; a
  Kylas conversion *is* the arrival signal.
- **Slots** are six fixed windows, 10:00–21:00 (`s1`…`s6`, the last only one hour
  long). `slotIndexFor` uses the browser's local hours and returns **-1** when a
  time falls outside 10–21 — an appointment booked at 09:30 lands in no slot.
- **Rota codes** are a 7-character string per member per week, one char per day
  from Monday, right-padded with `-`. Codes: `1` 1st shift, `2` 2nd, `g` general,
  `o` week off, `l` leave, `c` comp off. `codeAt` returns `-` for anything
  unrecognised, so an unknown character degrades to "no shift" rather than
  throwing. Weeks are keyed by the Monday's `ymd`.
- **Shift hours** (`SHIFT_HOURS`) differ weekday vs weekend, and general shift
  starts at `9.5` — that is 9:30 as a decimal hour, not 9:50.
- Rota window: `ROTA_PAST_DAYS` 60, `ROTA_FUTURE_DAYS` 180.

## Branch resolution is fuzzy, and fails open

`BRANCHES` is a seven-item list. `sameBranch` strips every non-letter, lowercases,
and matches if **either** string contains the other — so "JP" matches "JP Nagar".
`BRANCH_ALIASES` exists to absorb misspellings that reached the CRM data
(`yelankha`, `yelanka`, `basaveshwaranagar`).

Two behaviours to know:

- `apptBranchesFor` returns **all** branches when the user's `allowedBranches`
  matches nothing. An empty or unrecognised branch list is treated as
  unrestricted, not as no access.
- `apptBranchesFromCrm` drops `hq`, `headoffice`, `corporate` and `warehouse`
  (after the same normalisation), and likewise falls back to all seven when the
  result is empty.

Role mapping: `CRM_ROLE_TO_APPT` maps CRM roles onto `presales` / `receptionist`
/ `manager` / `admin`, and **an unknown role defaults to `presales`**.
`superadmin`, `admin` and `tech` always get every branch.

## Gotchas

- Branch names here are `"HSR"` and `"Basaveshwar Nagar"`. Store Display uses
  `"HSR Layout"` and `"Basaveshwara Nagar"` for the same stores — see
  `docs/store-display/context.md`. Never join the two lists on name.
- `phoneOf` takes `phoneNumbers[0]` with no type preference, so a lead whose
  first number is a landline shows that.
- `link3d` prepends `https://` to `companyWebsite` when it has no scheme — the
  field is repurposed to carry a 3D-design link.
