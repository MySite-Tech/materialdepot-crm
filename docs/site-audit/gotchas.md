*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## A pre-booking and the audit it becomes are two rows, not one

`Store_Team_App` books a slot before the Kylas enquiry exists, so the two halves
of one job live in separate `audit_orders` rows:

| | `pi` | `po` | status |
|---|---|---|---|
| Store pre-booking | `SRES-<STORE>-<ts>` | the enquiry ID | `slot_reserved` → `slot_converted` |
| The real site audit | that enquiry ID | the MD order id | `pending` → … → `completed` |

**The pre-booking's `po` IS the other row's `pi`.** That exact link — not the
customer name, not the phone — is how the two are tied together; it is what
`Store_Team_App`'s slot-availability check already absorbs bookings by, and what
`dropSupersededPreBookings` (`components/site-audit/views/bm/index.tsx`) uses. Name and phone are free
text on the reservation form (the phone is often the *store's* own number, shared
across unrelated bookings), so matching on them merges different customers — the
same rule as **Order attribution** above.

Every list that shows a BM their own orders drops a pre-booking once the audit
exists — either the linked order is provably present, or an SM marked it
`slot_converted` ("service created"). Applied to the RAW rows **before** they are
narrowed to one BM, since whether the audit exists is a question about the whole
table and the audit row may carry a different (or missing) BM link than the
pre-booking. A pre-booking still waiting on its service order stays visible: it
is the only record that the slot was ever held.

The ops/SM views take the opposite approach and filter both statuses out of the
main list with a dedicated pre-booking filter (`components/site-audit/audit-ops/views/`) — that is
deliberate, not an inconsistency. Don't unify them.

## `Array.isArray(rows) ? rows : []` turns a server error into empty data

`sbGet` (`shared/sb-client.ts`) returns `r.json()` **without checking `r.ok`**, so
any 4xx/5xx resolves a PostgREST *error object*, not a throw. Callers that write
`Array.isArray(rows) ? rows : []` therefore render a server error as legitimately
empty — indistinguishable from "nothing matched".

The same shape bites one level up, and that case is easier to miss: a wrapper
that catches into `[]` makes its CALLER's error branch dead code.
`fetchLeadDeals` catches, so `lookupEnqId`'s `unavailable` state — written
specifically so a Django outage could not be reported as an invalid Enquiry ID —
could never fire (fixed 2026-09-08). **When you write a distinct failure state,
check that the thing you call can actually fail into it.** `fetchClientTickets`
and `fetchClientOrderRows` call `fetchCRMLeads` directly for this reason.

Harmless for a count or a badge. **Dangerous for anything a workflow is gated
on.** It hard-blocked assignment in both ops views (fixed 2026-08-19, commit
`c589ec8`): the auditor/installer rosters load once when the view mounts but the
assignment picker reads them on every drawer open, so one failed fetch emptied
the picker for as long as the view stayed mounted, and the empty state blamed the
city filter for what was a connection problem.

The shape to copy when a load feeds a picker or a gate — see `loadAuditors` in
`components/site-audit/views/ops/index.tsx`:

- a non-array response **throws** (it is a failed load, not an empty roster);
- the last good data survives the failure, so a blip can't blank a working picker;
- retry on the same 8s backoff `loadOrders` uses, self-clearing on success, plus
  the poll and `visibilitychange` **only while the load is known broken** (the
  error flag mirrored into a ref, so the mount-once poll effect reads the current
  value without rebuilding its interval);
- the empty state distinguishes *couldn't load* from *genuinely none* — house
  style is soft-gate-and-surface, and "No auditors in this city" for a dropped
  request sends the SM to the wrong control entirely.

`loadShadowers`, `loadBms` and the deploy-safe `detect*` probes share the pattern
but degrade safely (optional shadower, free-text BM fallback, feature stays
inert). Leave them; they are not gates.

## Two render-loop guards

- **`use-owned-extras`' `deps` is a stable key for `people`.** The array's
  identity changes on every render of the parent, so depending on the array
  itself re-fetches in a loop.
- **`cat-analytics-panel`'s `nonce` is the redraw trigger** for in-place target
  edits, working alongside `targetsRef`. Editing a target mutates the ref and
  bumps the nonce rather than replacing state.

## A revisit is a re-assignment, so the assignees' `completed` has to be cleared with it

There is no revisit action: ops re-book the slot and re-assign the installer on
the sub-job that was already finished. `subjobDisplayStatus` rolls a sub-job up
to `completed` when **every** assignee is, so the `completed` left on the
previous visit's assignment flipped the whole order back to *Site Installation
Completed* the moment the new slot was booked — the revisit disappeared from
every live list and need-action count, and the installer's own app, which reads
his `assignments[]` row, filed the new job under "Done · Download PDF" with
nothing to tap. `ENQ2026090590356`: wall panels installed 11 Sept 2026, SM set
the order to Partially Completed, slot re-booked for the 16th and the same
installer re-assigned on the 15th — badge read Completed, installer saw nothing.

`bookSlot` and `saveAssign` now clear the assignee statuses when **all** of them
read `completed` (`allAssigneesDone`). That combination is the only one that can
flip the rollup, and it is what "everyone is being sent back" looks like in the
data; a sub-job where one assignee finished and another is being added keeps the
finished one terminal, which is the rule the 32-arrivals landmine bought. A
`completed` is also no longer terminal on a row whose **installer was swapped** —
`pickInstaller` overwrites the installer on the existing assignment row, so the
incoming person inherited the outgoing person's completion and the sub-job stayed
rolled up as done.

Both paths log `revisit slot booked` / `revisit assigned`, so the timeline says
which visit a line belongs to.

The parent then reads *Site Installer Assigned* rather than *Partially
Completed*. That is deliberate: the SM's `partial` describes the visit that
happened, and once a new visit is booked the badge that helps is the one naming
the stage the order is actually in. What was outstanding stays in the log and in
`sj.jobcard.rooms`.

**Six live orders were already in this shape on 2026-09-15** (`ENQ2026090590356`,
`ENQ2026083189452`, `ENQ2026081886657`, `ENQ2026062075657-R`, `ENQ2026061274030`,
`ENQ2026071279303`) — every one a re-assignment after completion, three of them
alongside a rectification order. The code change does not repair them: re-saving
the assignment from the drawer does, because the same `allAssigneesDone` test
fires on that save.

## The store-team store list is hardcoded and must carry a city

`STORES` and `STORE_CITY` (`views/store-team/constants.ts`) are a hand-kept list,
not a DB read. A new branch (e.g. Electronic City) has to be added to both: a
store absent from `STORE_CITY` has no city, and a store absent from `STORES`
never appears in the picker at all. Keep the names in step with the branch's
`OrganisationBranch.branch_name` — matching here is by display name, not id.

## Audit slots are counted per store, in Django only (2026-11-18)

The store kiosk (`/store-booking`) and the customer app both show what Django's
`order/services/site_audit_pools.py` decides. The kiosk reads
`GET /site-audit-store-slots/?store=` (public, no authentication at all, counts only)
and the app reads `/site-audit-slots/`. The browser no longer counts anything, so
there is no second copy of the rule to drift.

- **One pool per store, one auditor each:** JP Nagar, Electronic City, Yelahanka +
  Basaveshwara Nagar (shared), HSR Layout, Whitefield, Gachibowli, Kompally. The
  roster, leave and daily caps no longer decide what is bookable. Sundays are closed.
- **A booking takes its window and the next one** (the auditor's travel buffer). The
  window before it stays bookable. The old rule blocked anything under two hours away,
  both sides.
- **Which store a booking is:** a kiosk PI carries it (`SRES-JPNAGA-…`); an audit that
  replaced a pre-booking (its `pi` is the pre-booking's `po`) inherits it; anything
  else is the client's sales BM's store, which Django reads off
  `UserManagerAssignment` and the BM's branch. All 678 audits of the 60 days to
  18 Nov had a BM with exactly one store. A BM at HQ, B2B or Commercial Street holds
  no pool; such a customer is offered the city's pools summed, and their booking
  takes no store's slot.
- **Overrides are kiosk-only and screen-only.** A Service Manager signed in to the
  CRM in the same browser gets "Book anyway" on a Buffer window; an admin also gets
  Sundays and closed days. The booking's log says it was booked over the buffer and by
  whom. A Booked window has no override. Nothing is stored, and the app never sees an
  override.
- **Blackouts and open Sundays are Django's only now** (`SITE_AUDIT_SLOT_BLACKOUTS`,
  `SITE_AUDIT_OPEN_SUNDAYS`): the kiosk shows Django's days, so the CRM's mirror was
  deleted. The windows are Django's: each store's own, else `SITE_AUDIT_SLOT_DEFS`.
- **Each store has its own hours (2026-11-20).** Audit Ops → Slots & timings
  (`audit-ops/views/store-windows/`) edits them per store pool and saves the
  Site Audit Supabase `app_settings` row `audit_store_slots`
  (`{pool id: [{start, end}]}`). A store with no entry keeps the six standard
  windows. Django reads it (`order/services/site_audit_windows.py`, cached 60s),
  counts each store only on its own windows, puts its buffer on the next window
  in that store's list, and accepts any store's window at cart checkout.
  `/site-audit-store-slots/` returns the store's `windows` and the kiosk draws
  from them (`windowsOf`). The CRM's `SLOT_DEFS` is now only the fallback for a
  Django that does not send `windows` yet. `STORE_POOLS` in the editor is a copy
  of Django's `SITE_AUDIT_STORE_POOLS` ids. A new store goes in both, or its
  hours can't be set. A window's slot id is its start time, so an existing
  booking keeps its time when hours change. A booking at a start that is no
  longer one of the store's windows takes no capacity. Saving re-reads the row
  first and writes only the chosen store's entry; if the read fails, nothing is
  saved, so a failed load can't wipe other stores' hours. This replaced the old
  per-device Wooden Flooring / Wallpaper lists, which no booking ever read (the
  drawer's time is free-form). Their `md_audit_slots_*` copies still load, only
  to label old orders.
- **A new store** goes in Django's `SITE_AUDIT_STORE_POOLS` (its branch names, exactly
  as `OrganisationBranch.branch_name`) and in the kiosk's `STORES` / `STORE_CITY`. The
  kiosk's PI code is the name without spaces, cut to six letters, so two stores must
  not share their first six letters.
- **If Django is down the kiosk says "Failed to load"** rather than guessing; the app
  falls back to an uncounted grid as before.

The reverse lever — a Sunday the team *does* work — is `OPEN_SUNDAYS`, mirrored
by Django's `SITE_AUDIT_OPEN_SUNDAYS`; same two-repo rule. Opening the date only
puts it on the picker: an auditor whose `weekly_off` is Sunday still reads as
unrostered, so the day shows 0 free until the roster is changed too.
