# Known landmines

**Covers:** `(repo-wide)`

## Purpose
Bugs that have already been shipped and fixed here, kept because the shape recurs. These entries cross-reference each other, so they live in one file rather than split across modules.

## Contents

47 entries. They live in one file because they cross-reference each other —
grep for a term, then read around the line you hit rather than opening all of it.

- A route handler holding the service-role key is the access check — RLS is not
- A Supabase write error is not an `Error`, so `String(e)` said "[object Object]"
- A booking's date must come from the sub-job, not from its assignment
- A tab's badge must count the rows that tab lists — derive both from one function
- Availability is per CITY, and the Store Team kiosk was the one surface that did not know it
- `AddStaffOverlay` never wrote a city
- Daily caps live on `profiles`, not in localStorage — and the columns are probe-gated
- Installer assignment flags caps, it does not block them; the auditor drawer DOES block
- `audit_ticked` / `subjobs[].jobcard` is ONE mutable slot holding both the 3s draft autosave…
- A photo that renders as `"1 photo"` is a photo nobody can see
- An optimistic-then-swap upload MUST go through a functional state updater
- The field apps write a log line more than once for one event
- A second write that only `console.error`s on failure is silent data loss
- `audit_ticked->sign->>name` is cheap to transfer and expensive to READ. The json path keeps…
- COE calling began on 2026-08-31, so nothing before that date has a field-service NPS at all
- A floor has no height
- The read side aliases `customer_name` to `name`, and both order drawers wrote the alias back
- `install-ops/OrderDrawer`'s `persist()` had no error handling
- A field app's stale-write guard has to compare like with like — the guard itself was the outage
- An SM re-assignment resets `sj.status` to `assigned` but used to leave the per-assignee…
- These two apps are PORTS of PWA apps that are still being changed
- `slot_reserved`/`slot_converted` pre-bookings were reaching auditors' own job lists
- A derived force-add set can still be reverted back to a hand-written one
- `defaultPermissionsForRole` had the identical drift, one level up
- One phone can have several `profiles` rows (a field-app account under a personal email…
- 13 of 129 profiles have a NULL `contact`
- `profiles.branch` exists but is blank for every row
- An empty `allowedBranches` means "all branches", not "no branches"
- `planSiteAuditRoleSync` short-circuits on `profile.role === target`
- `SiteAuditPerfView` only computes stats for people who perform jobs (`statsFor` keys off…
- Field staff are not assigned to a store anywhere in either system
- A service manager must only ever see EXECUTION analytics
- Site Audit `profiles` rows double as login identities on the still-live public…
- A reference list loaded once on mount
- `AUDIT_COLS` (`components/site-audit/views/bm/index.tsx`) now also carries `bm_journey` and…
- `SiteAuditBranchManagerView`'s `ROLLUP_AUDIT_COLS` is deliberately narrower than `AUDIT_COLS`…
- Never gate a mandatory action note on `window.prompt()`/`window.confirm()`/ `window.alert()`
- `branch_mgr` was added to the app on 2026-08-14 but the Site Audit Supabase's…
- A boolean "cancelled" flag on a retryable capture is a one-way door
- Never disable a field app's only forward control on a permission or device probe
- `if (busy) return` where `busy` is state is not a lock
- A re-assignment must only reset the assignees whose work actually changed
- Only the PRIMARY installer writes `sj.status`
- `audit_ticked` is excluded from `AUDIT_COLS` for good reason

- **A Supabase write error is not an `Error`, so `String(e)` said
  "[object Object]".** `upsert`/`deleteB2BRow` in `lib/b2b/` reported failures
  as `e instanceof Error ? e.message : String(e)`, and a PostgrestError is a
  plain object — so every failed write showed a rep the literal text
  `[object Object]`. It only surfaced when the KAM board started reporting write
  failures out loud instead of dropping them. `writeErrorMessage` pulls out
  `message`/`details`/`hint` and appends `code`, which is the field that
  matters: **42703 is the missing-column signature** this repo hits every time a
  migration has not been run, and it was being hidden. Any new catch that shows
  a backend error to a user goes through that helper.

- **A booking's date must come from the sub-job, not from its assignment.**
  `sjsForDay` derived a day's installs purely from `sj.assignments` (falling back
  to a synthetic assignment when only `sj.installer` was set), and returned
  nothing when both were empty — so an install that is **booked but not yet
  assigned to an installer** did not exist as far as the Schedule tab was
  concerned. Because future bookings are unassigned until an installer is
  allocated, every day after today read **"No installs"** while the legacy
  `material-depot-site` SM app showed them correctly as "Unassigned · scheduled".
  Past days looked fine, which is what hid it: they are assigned. The nav
  counter three files away had it right all along
  (`orders.filter(o => o.subjobs.some(sj => sj.date === todayStr))`), so the two
  numbers silently disagreed for any unassigned day. `sjsForDay` and
  `ScheduleView` now fall back to `sj.date === ds` when there is no assignment.
  Fixed 2026-09-10; the same logic was on `main` (`install-ops/shared.ts:376`)
  since before the refactor. **An assignment is a staffing decision; the date is
  the booking. Never read one to learn the other.**

- **A tab's badge must count the rows that tab lists — derive both from one
  function.** Four badges in `install-ops` and one in `audit-ops` were computed
  inline next to the nav definition while the view re-derived its own list, and
  the two rules had drifted apart: **Follow-ups** counted only follow-ups *due*
  (`follow_up_date <= today`) while the tab listed every *open* one, so the badge
  read 7 beside 11 rows (both modules had this); **Need Action** summed
  `ops + followUps + resched` without the view's de-dup of follow-ups against
  ops-calls, and counted reschedule *orders* where the view lists reschedule
  *sub-jobs*, so it could exceed its own list; **To reschedule** likewise counted
  orders, including ones whose order-level status was `reschedule` with no flagged
  sub-job — rows that render nowhere; **Today's installs** counted orders while
  the calendar counted sub-jobs. `needActionGroups`, `reschedSubjobs`,
  `openFollowUps` and `sjsForDay` are now the single source for each queue, used
  by the badge and the view alike. Fixed 2026-09-10; all of it predates the
  refactor. Same family as the booking-date landmine above: **two places
  computing one number will drift, and the badge is the half nobody checks.**

- **Availability is per CITY, and the Store Team kiosk was the one surface that
  did not know it.** An auditor/installer is assigned a city when they join and
  works only that city. Every SM view scopes correctly through `inCity()`, but
  `SiteAuditStoreTeamView` knew only its STORE and had no store→city map at
  all, so it counted the entire company: JP Nagar read **"13 of 15 auditors
  available"** off an 18-person roster that included 7 idle Hyderabad auditors,
  when Bengaluru actually had 9 available that day. It also counted *orders*
  company-wide, so a Hyderabad booking consumed a Bengaluru store's slot. Fixed
  2026-09-02 with `STORE_CITY` + `cityOfStore()`; an unmapped store falls back
  to `CITIES[0]`, so forgetting a line when a store opens is a wrong-but-bounded
  count rather than a global one. **Filter by city CLIENT-side, not with
  `city=eq.` in the query** — 2 live `audit_orders` rows have a NULL city and
  `cityOf()` reads NULL as Bengaluru, so a server-side filter silently drops
  them.
- **`AddStaffOverlay` never wrote a city, which is how the bleed would have
  come back with the next hire.** The installer add form posted no `city` at
  all, so profiles landed NULL → read as Bengaluru; one live installer (Ayaz
  Khan) is still in that state. The *auditor* form always had the field. Both
  forms have since been replaced by the single `AddFieldStaffModal`
  (2026-09-03 — see *Staff come and go*), which requires city AND phone and
  defaults the city to the SM's active filter. **If you add another
  staff-creation path, it must write `city` and `contact`** — or better, call
  `createFieldStaff` rather than adding one.
- **Daily caps live on `profiles`, not in localStorage — and the columns are
  probe-gated.** Caps used to sit in `localStorage.md_audit_caps`, which made
  them device-local: the other SM, the SM's own phone and the public kiosk all
  disagreed, and the kiosk ignored caps entirely and counted headcount.
  `profiles.daily_cap` (per-person default) + `profiles.cap_overrides` (jsonb,
  per-date exceptions) replace it — see
  `site-audit-migration-003-staff-caps.sql`. **That migration was written but
  never actually run**: probed live on 2026-09-03, both columns answered
  `42703 column does not exist`, so the caps feature shipped in `4f431b0` has
  been inert in production the whole time — `rosterSelect()` probes, gets
  "missing", and degrades every cap to its default, which means an SM setting a
  number saw it accepted and lost it on reload. Its two statements are repeated
  inside `site-audit-migration-004-staff-exit.sql` (all `if not exists`), so
  running that one file fixes both. **A committed migration in this repo is not
  evidence it has been applied — probe the column before trusting a
  DB-backed feature.**
  **PostgREST fails the WHOLE select with `42703` if those columns are absent**,
  so asking for them unconditionally would take out the roster query and with it
  the kiosk's ability to book at all. Every roster query therefore goes through
  `rosterSelect()`, which probes once and — when the answer is *unknown* rather
  than "missing" — returns the SAFE column list, degrading to default caps
  instead of guessing "present" and turning a network blip into an outage.
  Verified in all four states (columns present / absent-42703 / network blip /
  live) before shipping. Installer caps default to the per-type constant via
  `typeDayCap()`, so nothing changes until an SM sets a number, and wallpaper's
  cap counts **3h SLOTS, not jobs** — do not "normalise" it against the other
  two.
- **Installer assignment flags caps, it does not block them; the auditor drawer
  DOES block.** `AuditOrderDrawer.pickAuditor` hard-returns on a full cap
  (long-standing). `AssignSection` deliberately only annotates the installer
  option (`· at cap (2/1)`, `· capped to 0 this day`, `· starts <date>`),
  matching both the off-day flag already there and this repo's soft-gate house
  style — installers had NO cap enforcement before, so hard-blocking would have
  been a new restriction on scheduling calls SMs make for good reasons. If you
  make it a hard gate, that is a product decision, not a bug fix.

- **`audit_ticked` / `subjobs[].jobcard` is ONE mutable slot holding both the 3s draft autosave
  and the signed job card, and this port shipped without the guard that keeps them apart.** The
  draft PATCHes `{draft:true, rooms}` with photos stripped. Reopen a completed card, touch
  anything, and 3s later the signature, the auditor, the date and every photo are gone. The legacy
  PWA hit this on `ENQ2026072381434` and guards with `jcHadSign` + an `audit_ticked_history`
  archive; the port carried over neither, so the damage was silent AND unrecoverable. Live on
  2026-09-01: **63 of 331 completed audits (19%) had a photo-stripped `{draft:true}` blob as their
  permanent job card** — only 4 had a history snapshot (restored 2026-09-02), **59 are gone**.
  Install side was 4 of 350, shielded only by `validateRooms` hard-requiring a room photo. Fixed
  2026-09-02: `hadSignRef` in both field apps (a signed card on file makes the draft device-local
  and shows an amber banner saying so), `archiveAuditTicked()` mirrors the legacy note-66 archive,
  the restore path consults the server for a signed card FIRST (a localStorage draft used to shadow
  it, which is the path on which the guard never learns the card was signed), and `draftPayload`
  now keeps photos that already reached Storage — a ~120-byte URL — dropping only in-flight base64.
  **Any new single-slot jsonb that a draft and a finished record share needs all four.**
- **A photo that renders as `"1 photo"` is a photo nobody can see.** Area-adjustment photos were
  captured, uploaded and stored correctly — 18 adjustments held 32 Storage URLs, all 32 HTTP 200,
  zero base64 — and then `components/site-audit/ui/audit-room-views.tsx` printed the array's *length* while `components/site-audit/brand/pdf-brand.ts` drew
  the adjustment table with no image column at all. The segment photo strip two lines below worked,
  which is exactly why nobody caught it: a site auditor reported *"after uploading any image
  related to adjustment area it's not showing in the job card after the final submission"* and
  reasonably concluded the upload was broken. Fixed 2026-09-02 in both renderers (and both legacy
  equivalents — see note 120 in `material-depot-site`); being a *render* fix it repairs every past
  order retroactively. When you add a field that holds photos, render the photos.
- **An optimistic-then-swap upload MUST go through a functional state updater.**
  `SegmentAdjustments` took a finished `AdjustRow[]` and rebuilt it from a render-time snapshot of
  `seg.adjust`. `SegmentPhotos` adds the photo as base64 immediately and swaps in the Storage URL
  up to ~20s later, so that swap ran against the array as it looked BEFORE the base64 was inserted:
  it matched nothing and wrote the pre-photo array back, **deleting the photo the auditor had just
  attached**. Segment photos never had the bug because they were always wired through the
  functional `onChange((r) => …)`. `onAdjust` now takes an updater, and the URL swap locates the
  photo **by value across every row** rather than by the row index the upload started on — a row
  added or removed mid-upload shifts that index and swaps the wrong row. Fixed 2026-09-02.

- **The field apps write a log line more than once for one event, so any metric
  counted off `log` entries must dedupe before it counts.** Arrival on time was
  counting the same visit repeatedly — 17 install and 30 audit person-day pairs
  in live data on 2026-08-26, one audit visit logged **20 times**, inflating the
  install metric by 13% and the audit metric by 23%. `_anArrivalStats` now keys
  on order + person + day (the PWA's Admin console always did; this port did
  not). Nothing surfaced it for weeks because a percentage cannot show you its
  own duplicate rows — it only became visible once the tiles started listing
  them. Two rules follow: a new log-derived metric needs the same guard, and
  mark a row "seen" only once it actually *counts*, or an entry skipped for a
  missing slot suppresses a later write for the same visit that would have
  resolved. See the Analytics section above.
- **A second write that only `console.error`s on failure is silent data
  loss.** Both COE rating forms saved the call, then projected the score into
  `ratings` inside `try { … } catch { console.error }`. The COE saw "Call
  logged", the score sat in the call log, and Analytics' NPS never counted it —
  with no error anywhere a human would look. Fixed 2026-08-25: the failure is
  surfaced in the form, `run()` now returns whether the call itself saved (so a
  score is never projected for a call that didn't), and Category Ops →
  ⭐ Review scores finds and pushes anything that slipped through. The same
  shape still exists elsewhere in this repo — `upsertSiteAuditProfile()` in
  `components/crm/index.tsx` is fire-and-forget with `.catch(console.error)`. Treat
  `.catch(console.error)` on a write as a bug report waiting to happen.
- **`audit_ticked->sign->>name` is cheap to transfer and expensive to READ.**
  The json path keeps the job-card room photos off the wire, but Postgres still
  detoasts the whole `audit_ticked` blob per row, so that select over all ~1.1k
  audit rows dies with `57014 canceling statement due to statement timeout`
  (500, not an empty result). `SiteAuditAnalyticsView` fetches it as its own
  query scoped to `status=eq.completed` — the 306 rows the metric's denominator
  actually needs — which returns in ~3s. If you add another jsonb-path column
  to a full-table select here, time it first.
- **COE calling began on 2026-08-31, so nothing before that date has a
  field-service NPS at all.** For the six days from 2026-08-25 this entry said
  not one COE call had ever been logged, and it was true: `coe_track` was `{}` on
  all 527 `audit_orders` rows, no sub-job carried a `coe_review`, and all 444
  rows in `ratings` were legacy on-site scores whose newest was 2026-08-24 — the
  day this repo removed on-site collection. Old source gone, new source unused.
  **That gap is now closed**: as of 2026-09-01 there are ~40 scored calls,
  roughly half audit and half install, every one dated 2026-08-31 or later (it
  went 40 → 41 inside a single session, so treat any exact figure here as a
  floor, not a fixture), with coverage around 20 of 324 audit reviews owed and 18
  of 282 install ones. Two consequences to expect rather than debug: **no date
  range ending before 2026-08-31 has an NPS**, so 📊 NPS analytics' "vs prev"
  legitimately reads "no prior period" on almost every preset, and its trend is a
  couple of points hugging the right-hand edge. A report of "NPS is empty" for an
  older period is this, not a code fault — check `coe_track` for calls inside the
  window before touching the pipeline.

- **A floor has no height — per-category wording belongs in `components/site-audit/data/audit-registry/index.ts`,
  not in the capture form.** `SegmentAdjustments` hardcoded the rectangle
  dimension pair as Height x Width, which is right for a wall and wrong for
  `flooring`, whose own fields are Room length / Room width. It is not a rare
  path: in a 60-order live sample, flooring carried **17 of the 28** area
  adjustments (more than wallpaper), every one of them a Rectangle, and the
  reasons are furniture footprints — "Bed", "Cupboard" — which have a length,
  never a height. Now `cat.adjDim1` (absent => 'Height'). The Triangle branch
  deliberately keeps Base x Height: there `h` is the perpendicular altitude in
  the ½·base·height formula, and zero triangle adjustments exist in live data.
  The stored keys stay `h`/`w` — only the label is per-category, so no migration
  and no change to `adjRows`, whose `size` string ("6.5 x 6 ft") is
  orientation-neutral and is what every read-only view and the PDF render.
  `md-audit-registry.js` + `Site_Auditor_App.html` in `material-depot-site`
  carry the identical fix; keep the two registries in step.
- **The read side aliases `customer_name` to `name`, and both order drawers
  wrote the alias back.** `audit_orders` and `install_orders` have a
  `customer_name` column and no `name` column at all (`profiles` does, which is
  what makes the mistake easy). `install-ops/shared.ts` and `audit-ops/shared.ts`
  both map `name: r.customer_name` on load, and both drawers' "Fix details" form
  PATCHed `{ name, phone, addr }` — PostgREST rejects the *whole* body with
  `PGRST204 Could not find the 'name' column`, so the phone and address were
  lost along with the name. Fixed 2026-08-26. When you add a write, check it
  against the column list, not against the UI type: the two disagree by design
  for `customer_name`, `matched_audit`/`matchedAudit`, `delivery_date`/
  `deliveryDate` and `original_delivery_date`.
- **`install-ops/OrderDrawer`'s `persist()` had no error handling, so every
  write in that drawer failed silently.** `sbPatch` *does* throw on a non-2xx
  (unlike `sbGet` — see the `Array.isArray` section), but `persist` was a bare
  `await sbPatch(...)` and none of its callers caught, so the rejection escaped
  into the click handler as an unhandled promise: no toast, no console entry a
  user would see, a Save button indistinguishable from a dead one. That is the
  only reason the `name` bug above survived — the SM had no way to learn the
  write was being refused. `persist` now catches, toasts, and returns whether
  the write landed (callers gate their form-close on it, and the three that had
  hand-rolled try/catch now pass a `failMsg` instead).
  `audit-ops/AuditOrderDrawer`'s `patch()` already had this shape — copy it, and
  treat a write wrapper with no catch the same way as `.catch(console.error)`.
- **A field app's stale-write guard has to compare like with like — the guard
  itself was the outage.** `advanceStatus` (`components/site-audit/apps/installer/index.tsx`) and `adv`
  (`components/site-audit/apps/auditor/index.tsx`) re-read the row before writing so an SM's concurrent
  change can't be clobbered (added 2026-08-21, `41a60d1`). Both compared a RAW
  DB status against the flattened on-screen one — different vocabularies — so
  the guard fired on jobs nobody had touched, and its own toast ("refresh to see
  the latest") could never clear it because nothing was stale. Three distinct
  mismatches, all live on 2026-08-26: `assigned` (DB) vs `scheduled` (UI,
  mapped in `loadJobs`); the display-only autoFlip to `callpending` 3h before
  the slot, which is never persisted; and the installer's own
  `assignments[].status` vs `sj.status`, which **only the PRIMARY writes** —
  `markAdditionalComplete` writes the assignment and nothing else, so an
  additional installer's "Your part marked complete" never moved their screen.
  19 of 43 live installer×sub-job pairs (44%) could not be advanced at all, and
  every freshly assigned audit was unstartable. Fixed with one derivation each:
  `statusForInstaller(sj, email)` and `normalizeAuditStatus(s)` — `loadJobs`
  **and** the guard must both call it, and the installer guard compares
  `job.storedStatus` (un-flipped) rather than `job.status`. Add a status or a
  display flip *there*, never at a call site. Note the PWA's
  `Site_Installer_App.html` has no such guard at all, so this class of drift is
  invisible in that app — don't take "it works in the field app" as evidence.
- **An SM re-assignment resets `sj.status` to `assigned` but used to leave the
  per-assignee statuses alone.** `AssignSection.saveAssign` seeds its editor by
  spreading the existing `assignments` rows, so re-assigning after a reschedule
  left `status:'reschedule'` on the assignment under a sub-job that said
  `assigned` — and since the field app reads the installer's *own* status, that
  showed them "To Reschedule — nothing to do" on a job just booked for them. It
  now resets each saved assignment to `assigned`, treating `completed` as
  terminal exactly as `OrderDrawer`'s `setStatus` does. Live proof this mattered:
  `ENQ2026071279303`'s wallpaper sub-job was re-assigned to Nadeem Khan on
  2026-08-12 *after* he had signed its job card, so `sj.status` read `assigned`
  over an assignment that (correctly) read `completed`. `SM_Install_Dashboard.html`
  in `material-depot-site` still has the un-fixed shape — keep them in step if
  you touch either.
- **These two apps are PORTS of PWA apps that are still being changed, so a
  status this repo has never heard of can appear in shared data at any time.**
  `partial` is a first-class SUB-JOB status written by
  `material-depot-site`'s `Site_Installer_App.html` partial-completion flow;
  `components/site-audit/apps/installer/index.tsx` knew nothing about it, so those sub-jobs rendered a raw
  `partial` pill above a detail panel with **no stage card and no buttons** —
  the same dead end as a hard block, just quieter. Both field apps now carry a
  stage registry (`INSTALL_STAGES` / `AUDITOR_STAGES`) and fall through to a
  self-describing "nothing for you to do right now — the office moves it on"
  block, so the next unknown status degrades instead of rendering blank. Keep
  the registry and the rendered branches in step.
- **`slot_reserved`/`slot_converted` pre-bookings were reaching auditors' own
  job lists.** 18 live reservation rows carry an `auditor_email`, so six real
  auditors saw held store slots as jobs — un-actionable by definition, since the
  real audit is a separate row (the reservation's `po` is that row's `pi`; 13 of
  the 18 were already `completed` there). `SiteAuditorApp`'s `loadJobs` now
  filters both statuses out, matching what `components/site-audit/audit-ops/views/` already does
  for the ops list.
- **A derived force-add set can still be reverted back to a hand-written one —
  this has now happened twice.** `SITE_AUDIT_ROLES` (`components/crm/constants.ts`) drifted
  from `CRM_ROLE_TO_SITE_AUDIT_ROLE` once before (`delivery` mapped to
  `service_mgr` there but was missing here), was made genuinely derived in
  commit `3bc84a6` (2026-08-19) — `...OVERSIGHT_CRM_ROLES,
  ...Object.keys(CRM_ROLE_TO_SITE_AUDIT_ROLE).filter(k => map[k]),
  'field_worker'`, plus a second independent path via the caller's own field
  profile role — and then a teammate's large same-area rewrite the very next
  day (`a4d5469`, "site audit fixes", introducing the `site_audit.*` slug
  system) silently reverted BOTH: back to a hand-copied literal missing
  `field_worker` entirely, and dropped the field-profile fallback path with
  it. Nobody noticed until three real field workers (site auditors/
  installers) reported no Site Audit tab at all (2026-08-24). Re-fixed the
  same way, but **if `SITE_AUDIT_ROLES` is ever touched again — especially by
  a large unrelated-looking "site audit fixes" commit — diff it against
  `CRM_ROLE_TO_SITE_AUDIT_ROLE` by hand rather than trusting that "it's
  derived" still holds**; a derivation is only as durable as the next person
  editing the same lines knowing it's there. Add a role to the map, never to
  a second hand-written list.
- **`defaultPermissionsForRole` had the identical drift, one level up.** It
  pre-checks the permission checklist in Admin > Users' Add/Edit forms and
  used to compute defaults from `ROLE_TABS` alone, without the three
  `resolveAllowedTabs` force-add sets. For any role missing from `ROLE_TABS`
  (`field_worker`, `delivery_manager`, `post_sales`, `procurement`), opening
  that person's row and hitting Save for an unrelated edit (e.g. a phone
  number) silently saved a permission list missing `crm.site_audit` —
  and once `individualPermissions` is non-empty, `resolveAllowedTabs`'s
  role-based fallback never applies again, so the tab was gone for good. Both
  functions now share one `defaultTabsForRole(role)` helper, so they can't
  diverge. Admin > Users flags any already-saved account this already broke
  (`⚠ Missing Site Audit` in the Permissions column) — that's a one-time
  backfill gap code can't self-heal; re-open Edit and check the box.
- **One phone can have several `profiles` rows** (a field-app account under a
  personal email alongside the company one — Ashish Bhat has exactly this, and
  the company-email row's `contact` is NULL so it can never be resolved by
  phone). `limit=1` on a `contact=eq.` lookup picks an arbitrary one; use
  `pickOwnProfile`, which prefers the row naming a renderable dashboard.
- **13 of 129 profiles have a NULL `contact`.** Nothing that keys off phone —
  own-dashboard resolution, payouts, BM attribution — can ever reach them; the
  Users screen already surfaces this as its top amber notice.
- **`profiles.branch` exists but is blank for every row.** Anything that scopes
  by store should read CRM Branch Access (`allowedBranches` from `fetchUsers()`)
  and match to profiles by exact phone, treating `profiles.branch` as an
  optional refinement — see `SiteAuditBranchManagerView`.
- **An empty `allowedBranches` means "all branches"**, not "no branches". Reading
  it the other way silently puts every BM in every store.
- **`planSiteAuditRoleSync` short-circuits on `profile.role === target`**, so it
  will never backfill `branch` (or a corrected name) for someone whose role is
  already right — which is all ~87 existing BMs. Fix the short-circuit before
  relying on that sync to populate anything but the role.
- **`SiteAuditPerfView` only computes stats for people who perform jobs**
  (`statsFor` keys off `auditor_email` / `created_by_email`). Feeding it BMs
  renders a wall of zeros that reads as "these people did nothing" — filter its
  `roster` to auditor/installer/SM roles.
- Field staff are not assigned to a store **anywhere** in either system, so
  per-store performance is genuinely unavailable, not just unimplemented.
- **A service manager must only ever see EXECUTION analytics.** In `material-depot-site`,
  `Admin.html`'s Analytics is five tabs (Category, Execution, Week on week, Penetration,
  Targets) and only Execution is field-ops; the rest carry revenue, AOV and store targets, and
  a `service_mgr` session is pinned to Execution in three places (forced in `renderAnalytics`,
  filtered out of the tab bar, and re-checked in `anSetTab`). **Those four commercial tabs now
  exist here too** (ported 2026-08-26 — see the *Analytics: two halves* section below), so the
  gate is live rather than hypothetical: `SiteAuditAnalyticsView` takes `execOnly`, and every
  service-manager host passes it — the SM's own dashboard, the SM view inside the Role Viewer,
  and `/site-audit-view`'s SM body. Gated twice, like the original: the tab bar renders only
  Execution AND `pick()` refuses anything else, so a stale `md_an_tab` in localStorage can't get
  past it. **Add a fifth mount of this view and you must decide `execOnly` for it** — the default
  is all five tabs, i.e. the order book. Related: this repo's Role Viewer renders each role's components inline rather
  than copying the original's iframe + localStorage impersonation, which is also why the
  2026-08-18 preview-leak bug in that app (its note 112) has no counterpart here.
- Site Audit `profiles` rows double as login identities on the still-live public
  `material-depot-site.vercel.app/Login.html` (email + 4-digit passcode, no OTP).
  Never create a profile with `passcode: null`; use `randomPasscode()`.
- **A reference list loaded once on mount, but read on every drawer open, breaks
  permanently on one failed fetch.** That is what killed auditor assignment;
  `loadOrders`-style retry + a self-describing empty state is the fix, not a
  louder `console.error`. See the `Array.isArray` section above.
- **`AUDIT_COLS` (`components/site-audit/views/bm/index.tsx`) now also carries `bm_journey` and
  `coe_track`**, so the conversion funnel can honour a manual "order placed"
  tick from either the BM or the COE for the whole list in one pass. They add
  ~16 KB to a ~2 MB payload (`log` + `skus` are almost all of it) — but do NOT
  copy them into `ROLLUP_AUDIT_COLS`, whose whole point is being narrow.
- **`SiteAuditBranchManagerView`'s `ROLLUP_AUDIT_COLS` is deliberately narrower
  than `AUDIT_COLS`** (dropping `log`/`skus` cut this list from 1.9 MB per poll to
  107 KB) — but it must keep `po`, which is never rendered and exists only so
  `dropSupersededPreBookings` can tell a held slot from the audit it became.
- **Never gate a mandatory action note on `window.prompt()`/`window.confirm()`/
  `window.alert()`.** They silently no-op in the contexts this app actually runs
  in — installed PWAs and mobile webviews commonly return `null`/`false`
  immediately with no dialog shown at all — and desktop Chrome permanently
  disables them per-origin once a user ticks "prevent this page from creating
  additional dialogs". The old `requireNote()` (site-audit install-ops'
  mandatory notes for status changes, follow-up date set/clear, installer
  assignment, added 2026-08-24) hit exactly this: a click did nothing, no
  error, indistinguishable from a broken button (fixed 2026-08-25). Use
  `useNoteModal()` (`components/site-audit/hooks/use-note-modal.tsx`) instead — a
  controlled in-page modal with the same "returns the trimmed note, or `null`
  if cancelled/left blank; caller MUST abort on `null`" contract, just as real
  DOM instead of a native dialog. `components/site-audit/install-ops/order-drawer/index.tsx`, `components/site-audit/install-ops/ui/assign-section.tsx`,
  `components/site-audit/audit-ops/order-drawer/index.tsx` and — since 2026-09-01 — `components/site-audit/coe-ops/views/followups.tsx`
  ("Mark lost") and `components/site-audit/coe-ops/wallpaper/index.tsx` ("Put on hold", "Cancel PO") use it.
  Reuse it rather than reaching for `window.prompt` again anywhere in Site
  Audit/Install. Those three survived four weeks past the first sweep because
  nothing about a silently no-opping button looks broken in code review, so
  **grep for `window.prompt` rather than assuming the sweep was complete.** The
  last live one — `components/site-audit/install-ops/order-drawer/index.tsx`'s required reason for
  force-completing an order with no signed job card, which also had a
  `window.confirm` in front of it — was converted 2026-09-03; the warning the
  confirm carried is now that `askNote` call's `preface`. As of that date a grep
  finds `window.prompt` only inside comments like this one. `RetireStaffModal`
  (`components/site-audit/staff/staff-modals.tsx`) was built as a modal from the start for the same reason:
  its exit reason is what the attrition breakdown groups by.
- **`branch_mgr` was added to the app on 2026-08-14 but the Site Audit
  Supabase's `profiles_role_check` CHECK constraint (plain `role in (...)`,
  not a Postgres enum type) was never widened to allow it — so every write
  that sets `role='branch_mgr'` fails at the DB layer, silently in some
  paths.** Found 2026-08-25 when 6 real branch managers (CRM `manager`/
  `store_manager` permission) had been stuck at "0 members" for 11 days.
  Three separate call sites hit this: `components/site-audit/staff/users/index.tsx`'s "Add New
  User" (`sbPost`, surfaces the raw Postgres error to the admin — this is how
  it was found); `applyRoleSync`'s bulk "Sync roles from CRM permissions"
  (`sbPatch`, same failure); and `upsertSiteAuditProfile()` fired from the
  CRM's own Admin > Users when `site_audit.branch_mgr` is ticked
  (`components/crm/index.tsx`, fire-and-forget with `.catch(console.error)` — fails on
  *every* save of that permission with no admin-visible error at all).
  Migration: `site-audit-migration-002-branch-mgr-role.sql` (run against the
  Site Audit Supabase, same as migration 001).
  **Also worth knowing while chasing this**: a Branch Manager doesn't
  actually need a `profiles` row to see their dashboard at all —
  `components/site-audit/views/own-dashboard/index.tsx`'s `sessionOnlyRole` branch renders
  `SiteAuditBranchManagerView` straight off the CRM session once
  `permissionRole==='branch_mgr'`, which comes purely from the
  `site_audit.branch_mgr` sub-permission slug on their CRM account (see the
  three-role-models section above) — a `profiles` row only matters for the
  Add-User/sync paths above, not for dashboard access itself. So if someone
  already has a CRM login, ticking that one checkbox in Admin > Users is the
  real fix; the migration just stops the DB from rejecting the profile-side
  writes that go along with it.

- **A boolean "cancelled" flag on a retryable capture is a one-way door.**
  `ArrivalCameraModal`'s `retake` set `cancelledRef = true` — to disown a confirm
  whose `uploadPhoto()` retry was still in flight — and never cleared it. Since
  `handleConfirm` checks that flag *after* the upload, the first Retake swallowed
  every subsequent Confirm for the life of the overlay: the modal stayed open,
  the button cycled Uploading… → Confirm, and no arrival was ever recorded.
  Retaking a photo is the most ordinary thing a field worker does here, so that
  one stale boolean was a silent dead end between "on the way" and "at site"
  (fixed 2026-08-26). It is now a per-attempt COUNTER, which is the shape this
  needs: a flag can say "this attempt is abandoned" but has no way to say "the
  next one is live". `camGenRef` next to it was already a counter for exactly
  this reason — copy that, not the flag.
- **Never disable a field app's only forward control on a permission or device
  probe.** The same modal's shutter was `disabled={!cameraFailed && !camReady}`,
  and `getUserMedia` can neither resolve nor reject — an Android webview with a
  pending permission sheet, or a camera another app holds, just leaves the
  promise open. `camReady` then stays false forever and the worker is left with
  Cancel as the only live button, unable to mark themselves at site at all. The
  shutter is now never disabled: it shoots the live preview when there is one and
  otherwise opens the OS camera, with a 6s watchdog that relabels it. The
  `material-depot-site` PWA always had this fallback (`snap.onclick` →
  `nativeCapture()`); the port dropped it. Related: bind a MediaStream to the
  `<video>` in an effect, not at the `getUserMedia` callsite — the element is
  unmounted while `cameraFailed` is set, so a late grant assigned `srcObject` to
  a null ref and left a black preview behind a live button.
- **`if (busy) return` where `busy` is state is not a lock.** Two taps inside one
  tick both read it as false and both write — one status change, two identical
  log lines. `advanceStatus` (`SiteInstallerApp`), `adv` (`SiteAuditorApp`) and
  the arrival modal's confirm all had this shape; each now holds a ref, with the
  state kept only for the disabled styling. This is the *write-side* half of the
  duplicate-log problem the Analytics dedupe guard compensates for on the read
  side — see the log-duplicate landmine above. A failed upload must also never
  fall back to embedding base64 in `log[]`: that column is fetched in full by
  every poll and has no slim view (7 live entries, ~30-50 KB each).
- **A re-assignment must only reset the assignees whose work actually changed.**
  `AssignSection.saveAssign` resets each saved assignment to `assigned`, which was
  added to stop a re-assign after a reschedule leaving `status:'reschedule'` on an
  assignment under a sub-job that said `assigned` (the field app reads the
  installer's own status, so that drift showed them "To Reschedule — nothing to
  do"). Resetting **every** assignee is the opposite bug and the one the field
  sees: the SM re-opens the form to add a second installer or fix a note, and a
  colleague already On The Way is yanked back to "Call the customer". They confirm
  again, the next edit resets them again. `ENQ2026071780139` collected 32 "on the
  way" entries on 2026-08-26 in bursts that each begin seconds after an SM
  re-assignment. Now scoped to assignees who are new to the sub-job, whose
  date/slots moved, or who still carry `reschedule`; `completed` stays terminal.
- **Only the PRIMARY installer writes `sj.status` — everyone else's progress
  lives on their `assignments[]` row, and nothing in Install Ops used to read
  it.** So the dashboard showed "At Site" on `ENQ2026082087114` while its own
  timeline said "Flooring installation done (additional installer: Ankit
  Sharma)" seven times over: both were true, and only one was on screen. There
  is now ONE derivation — `assigneeStatus` / `subjobDisplayStatus` /
  `assigneeProgress` in `install-ops/shared.ts`, mirrored by
  `subjobEffectiveStatus` in `components/site-audit/apps/installer/index.tsx` — and every sub-job status
  the SM sees goes through it, so the badge, the calendar, the drawer and the
  order row cannot disagree. Three rules it must keep: a sub-job rolls up to
  `completed` only when **every** assignee is (one installer finishing must not
  bill the OMS service leg, which is gated on the parent rollup, nor skip the
  customer signature); `partial` and `completed` are never overridden (`partial`
  states that rooms are still outstanding); and `mapInstallRow`'s
  `reconciledOrderStatus` only ever moves an order that is stuck on a TRAVEL
  status, because `pending`/`deliv_*`/`created`/`call_na` are pre-service states
  no sub-job speaks to and an SM's deliberate `partial` is theirs to keep. On
  live data that reconciliation moves exactly 1 order and 1 sub-job badge, while
  surfacing 23 installer rows whose own status had been invisible. The
  `material-depot-site` PWA had the same split *and* fed it into the field app's
  own `loadJobs`, which is the worse half — see note 119 there.
- **`audit_ticked` is excluded from `AUDIT_COLS` for good reason, but
  `mapAuditRow` hardcoding `auditTicked: null` silently disabled every category
  display in the audit ops views.** The Categories column and the pre-booking
  drawer could only ever fall through to `o.service`, i.e. `—` on anything
  pre-service. And the store's own ticks never reached the audit at all: the two
  halves of one job are two rows (see the pre-booking section above), the store
  records the material on the reservation, and the audit row is created later by
  `autoImportAuditOrders` from an OMS order whose only SKU at that point is the
  audit service line — so `tickedCategories` yields `[]`, as it has on every live
  pending audit. Fixed 2026-08-26 with `AUDIT_CATEGORY_QUERY` — a second, narrow
  select over `PRE_CARD_STATUSES` only (210 rows / 36 KB / ~0.9s live, versus the
  full-table select that times out) whose last good result is held in a ref so a
  30s poll never repaints the table with the pills missing — plus a carry-over
  keyed on **the pre-booking's `po` === the audit's `pi`**, never the name or
  phone. It lands in a separate `storeCategories` field rather than being merged
  into `auditTicked`, because the two were ticked by different people and
  `categoriesAreFromStore` labels which one is on screen. **Do not "simplify"
  this by adding `audit_ticked` to `AUDIT_COLS`.**
- **A caught error behind a typed return is invisible at the call site, and the
  B2B module had five of them at once.** Fixed 2026-09-10. Each wrapper caught
  internally and returned a plausible-looking value, so a failed request
  rendered as a confident number: `fetchB2BPipelineStats` and
  `fetchVerticalStats` returned `EMPTY_BUCKET` (a ₹0 pipeline on the Dashboard),
  `fetchTargets` returned the built-in 120L default (indistinguishable from a
  team that set 120L), `saveTargets` returned `void` so a target edit looked
  saved and was not, and `clientMetricsFrom` counted `zeroFill`'s placeholder
  rows as real so every client read ₹0 lifetime revenue. From the user's side
  none of these looked broken — the Dashboard just showed a bad month. The fix
  is the same shape each time: the return type carries `ok` (or the error
  string), and the view renders a banner instead of the number. Note the near
  miss in the last one: `B2BBulk.ok` already existed and already gated the
  *dates* correctly via `orderDatesFromAggregates` — the money simply never read
  it. **When you add an `ok` flag, grep every field derived from that response,
  not just the one that prompted the flag.** Related: the Kylas `total: 0` trap
  in `docs/b2b/data-layer.md`, and `Array.isArray(rows) ? rows : []`.
- **A merge that is conditional on `page === 0` silently drops local edits on
  every other page.** `fetchInboundBoard` skipped the Supabase read unless
  `page === 0 && !kylasStage`, so paging past the first page of the inbound
  board — or selecting any Kylas stage filter — showed raw Kylas with the
  team's stage, follow-up, order value and notes missing. Nothing errored and
  the board looked normal. Fixed 2026-09-10 by always running the read and the
  overlay, and returning early on those paths. The reason it was written that
  way is real and worth preserving: page 0 assembles
  `[...dbLeads, ...kylasNotInDb]`, so **"has a Supabase row" doubles as a sort
  key** and edited leads sit above untouched ones. Rewriting the whole function
  to overlay in Kylas order is cleaner, loses that grouping, and was reverted
  the same day — do the early-return instead.
- **`` `PREFIX-${Date.now()}` `` is a primary key, not a display string.**
  `CLI-` (client) and `KAM-` (order) ids are Supabase upsert conflict targets,
  so two people creating a record in the same millisecond silently overwrote one
  another — no error, one record simply gone. `OR-`, `INT-` and `ESC-` had the
  same generator. Replaced 2026-09-10 with `newB2BId(prefix)` in
  `components/b2b/models/ids.ts`, which appends a random suffix. Grep for
  `Date.now()}\`` before adding any new record type.
- **RLS on the table does nothing for a route handler holding the service-role
  key — the route itself is the access check.** `/api/store-checklist` shipped
  with `enable row level security`, no policy, execute revoked from `anon`, and
  a comment explaining that the browser therefore could not forge a mark. All
  true, and all irrelevant: the route *bypasses* RLS by design, took `store`,
  `date` and `by` from the request body, and required no token — so anyone who
  could reach the app could read every store's compliance history, write marks
  for any store up to 30 days back, and sign them as any name. The per-role
  backdating (`BACKDATE_DAYS`) existed only in the React component. Fixed
  2026-09-11 with `requireCaller` (`lib/server/session.ts`), which resolves the
  caller from the JWT's `user_id` against the Django org roster, after which the
  route re-runs the **same** `canUseChecklist` / `storesForActor` / `canMarkDate`
  helpers the UI uses and stamps `by` from the session. Two general shapes:
  **a UI-side permission check is not a permission check**, and a route handler
  that holds a privileged key must answer "who is asking" before "what do they
  want". The other 16 `app/api/*` routes still take no token; they proxy to
  Kylas/Django with a server-held key rather than driving a service-role DB
  client, so the blast radius differs, but do not read their existence as a
  precedent for a new one.
