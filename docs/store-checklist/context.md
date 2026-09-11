# components/store-checklist

**Covers:** `components/store-checklist/**` · `lib/store-checklist/**` · `app/api/store-checklist/route.ts` · `supabase/migrations/supabase-store-checklist.sql`

## Purpose
The daily EC opening / housekeeping / working-hours / closing checklist the
receptionist at each store filled on paper every morning, plus a compliance view
for whoever has to chase the stores that did not fill it.

## Data

| Call | Where from | How |
|---|---|---|
| A day's marks, and any range of days | CRM Supabase table `store_checklist` | `fetchChecklistDays` → `GET /api/store-checklist?stores=&from=&to=` |
| Saving marks | same table, via `store_checklist_mark()` | `saveChecklistMarks` → `PATCH /api/store-checklist` |
| Who the caller is | Django `/user-organisation/`, **server-side only** | `requireCaller` in the route, 30 s cache per token |

Two requests per tab visit at most: the marker view issues one GET for
(store, date), the compliance view one GET for every store the user can see over
`HISTORY_DAYS` (14). Neither view polls. Saves are debounced 900 ms and batch
every item touched in that window into one PATCH.

The session lookup is **not** a third browser request — it happens inside the
route handler, so the tab still costs 1–2 against the ten-request budget. It does
cost one Django call per checklist request, which is why `requireCaller` caches
the resolved caller for 30 s per token; `/user-organisation/` is itself cached
server-side by Django when unfiltered.

Both calls send `Authorization: Bearer <jwt>` and retry once through
`refreshSession()` on a 401, because a plain `fetch` to an `app/api/*` route
does not get `mdFetch`'s token refresh. Without that a tab left open past token
expiry would fail every save until a reload.

**The `store_checklist` table and its `store_checklist_mark()` function must be
pasted into the CRM Supabase project** (`supabase-store-checklist.sql`) — nothing
in this repo runs migrations. Until they exist, every read 502s with
`Could not find the table 'public.store_checklist'`, and both views render that
message instead of a checklist. That is deliberate: a markable checklist whose
saves all fail would have receptionists ticking 37 boxes into nothing.

## The 37 items are stored data, not just labels

`CHECKLIST_SECTIONS` in `lib/store-checklist/constants.ts` is the registry: four
sections (`opening` 18, `hk` 10, `working` 4, `closing` 5) and one stable id per
item. Those ids are the **jsonb keys in every historical row**, so renaming
`op_music` orphans every mark ever made under it — add and deprecate, never
rename. Adding an item makes older days read as incomplete against the new
total, which is correct but worth expecting.

Each mark is `{ v: 'yes' | 'no' | 'na', c: comment, at: iso, by: name }`. `at`
and `by` are stamped **server-side in the route handler**, not by the browser, so
a late fill is visible as a late fill.

## Marks merge; they never replace

Two people mark the same row on the same day — the receptionist in the morning,
the store manager at closing — and a read-modify-write from either tab would drop
the other's work. `store_checklist_mark()` does `items || excluded.items`, a
top-level jsonb merge where each item id maps to a whole object, so a PATCH
overwrites exactly the ids it carries. Do not replace that RPC with a
`select`-then-`upsert` in the route.

The same reasoning gave the table a `(store_code, check_date)` composite primary
key, exactly as `rota_plan.sql` is keyed per branch.

## Who can mark what

`BACKDATE_DAYS` is the whole policy: `retail` (the receptionist role) 0 — today
only; `store_manager` / `manager` 6; `admin` / `tech` / `superadmin` 30. Everyone
can *view* the last 14 days, and an unmarkable date renders the day read-only
with a line saying why rather than hiding it. There is no assistant-store-manager
role in this CRM — an ASM is carried as `store_manager` or `retail`, so both can
stand in for the receptionist.

**Those windows are enforced in the route, not only in the UI.** Every request
resolves the caller from its own JWT (`requireCaller`, see
`docs/api-layer/context.md`) and then re-runs the *same* `canUseChecklist` /
`storesForActor` / `canMarkDate` functions the UI uses, so the browser and the
server cannot drift apart:

| Rejected | Status |
|---|---|
| No / malformed / expired `Authorization: Bearer` | 401 |
| Token Django will not accept | 401 |
| `user_id` not on the org roster, or the account inactive | 403 |
| A permission list that lacks `crm.store_checklist` | 403 |
| Reading or marking a store outside the caller's branches | 403 |
| A date past the caller's own `BACKDATE_DAYS`, or in the future | 403 |

`by` is **stamped from the resolved session**, never from the body — a client
that sends `by` is ignored, so attribution cannot be forged by the person
marking. The 30-day cap the route used to apply to everyone is gone; the
per-role window is the only limit, and it is the same table above.

The service-role key still matters for the layer underneath: RLS is on with no
policy and execute is revoked, so the **anon key cannot touch this table at all**
and nobody can rewrite a store's history from the browser console.

Both checks fail closed. If Django cannot be reached to verify a session the
route answers 502 and the UI says so — it never falls through to "unverified, so
allow".

## Store identity is a code, never a branch name

Rows are keyed by the `*_ec` store codes from
`lib/store-display/display-supabase.ts`, because branch *names* differ per module
(`HSR` vs `HSR Layout`, `Basaveshwar Nagar` vs `Basaveshwara Nagar`) and joining
those lists on name is a known trap — see `docs/appointment-tracker/context.md`.

`storesForUser` resolves a user's Django `allowedBranches` onto codes through
`BRANCH_NAME_TO_STORE_CODE`, an **exact lookup after lowercasing and stripping
non-letters** — not the `sameBranch` "either string contains the other" match
used by the appointment tracker. A write surface must not guess which store it is
writing to. Consequences, all deliberate:

- One matched store → auto-selected. Several → no default, the user picks.
- A branch name that matches nothing → the store list falls back to all seven
  **with no default selected**, plus an amber notice naming the unmatched branch.
  A silent all-stores default would have someone marking the wrong store's sheet.
- `manager` / `admin` / `tech` / `superadmin` get all seven regardless of
  `allowedBranches`, and an empty `allowedBranches` still means all (the repo-wide
  convention — see `docs/landmines.md`).

## Deliberate calls worth not re-litigating

- **"Rest Yes" per section.** Marking 37 items on a phone every morning is the
  reason the paper sheet survived; a per-section bulk-Yes keeps it fast and every
  item still gets its own `at`/`by`. There is deliberately **no** one-tap
  all-sections button.
- **A `No` with no note is saved, not blocked.** It is counted instead — the row
  goes amber, the day header says how many, and the compliance tab has a
  "No without a note" card. Soft-gate-and-surface, per house style.
- **A failed save never reads as saved.** The pill shows `Not saved — <message>`
  with a Retry, the touched rows keep an amber dot, and the pending marks stay
  queued in the hook; a re-edit during an in-flight save is kept (the flush
  compares mark identity, not just ids, before clearing the queue).
- The compliance grid is 7 stores × 14 days, so it is not paginated; the
  "Marked No" table is, at `PAGE_SIZE = 25`, and its stat cards count the whole
  window rather than the page.
