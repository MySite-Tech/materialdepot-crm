# components/remarks-quality

**Covers:** `components/remarks-quality/**` · `lib/api/dashboards/remarks-quality.ts`

## Purpose
Scores Sales CRM lead remarks on the four pointers of the remarks guide —
**Need / Stuck / Who / Next + date** — and rolls them up by Experience Centre,
BM and day. Three views: Dashboard, EC report cards (one per store for one day),
BM scorecard. Every tile, row, bar and heatmap cell drills into a drawer listing
the remarks behind it; any cart id opens that cart's full history.

Ported 2026-10-23 from a standalone Vercel prototype that read Metabase with a
shared login. The logic is a 1:1 port of its page script; the data now comes
from Django, gated by a CRM slug. Retire the prototype once this tab is live.

## Data — one call on mount

| Call | Endpoint | When |
|---|---|---|
| `fetchRemarksQuality` | `GET /crm/remarks-quality/` (`?fresh=1` on ↻) | mount — every remark of the last 95 days plus 35 days of walk-ins |
| `fetchRemarkTexts` | `GET /crm/remarks-quality/texts/?ids=` | the drawer page on screen, the report cards' remark of the day, and search |
| `fetchLeadHistory` | `GET /crm/remarks-quality/lead-history/?lead=CT…` | clicking a cart id; cached per cart until the mount payload is next fetched |

The mount payload is dictionary-encoded rows, not objects: ~83k remarks is
~7 MB raw (gzipped by Django's global middleware), and the whole tab filters it in memory, so no
filter change ever refetches. Remark **text** is deliberately not in it —
`texts/` serves at most 400 ids per call (`REMARK_TEXTS_BATCH`), and search over
a drawer tab is capped at the latest 6,000 remarks (≤15 calls, user-triggered).
A text that failed to load renders "Text did not load", never an empty remark.

Django builds the payload in ~12 s and caches it in Redis for 10 minutes, so
the first open after expiry is slow and ↻ Refresh (which bypasses the cache)
costs the same 12 s of database time. Don't put ↻ on a timer.

`fetchRemarksQuality` keeps the payload promise in a module-level cache for the
same 10 minutes, keyed by the caller's `allowedBranches`, so switching tabs and
back does not re-download 7 MB; ↻ bypasses and replaces it, and a failed fetch is
dropped rather than cached. Every network fetch of the payload also clears the
lead-history cache, so a cart history never outlives the scope it was fetched
under (logout does not reload the page, so module caches survive a user switch).
Remark texts are de-duplicated in flight: an id already being fetched is awaited,
not requested again. Dates are IST (`Asia/Kolkata`) regardless of browser zone:
`today()`, the report cards' after-6pm default and "Data as of".

## Scoring lives in Django, and the browser re-runs it for one thing

The pointer bitmask (`pt`: 1 Need, 2 Stuck, 4 Who, 8 Next+date) is computed in
Postgres from `POINTER_PATTERNS` in
`MaterialDepotDjangoBackend/order/crm/remarks_quality/constants.py`. Those are
Postgres ARE patterns (`\y` = word boundary). The payload ships them as `rx`, and
`compilePointers` turns them into JS regexes (`\y` → `\b`) only to tag remarks
in the lead-history timeline, which come from a different query. The two engines
agreed on 2,986 / 2,986 sampled remarks on 2026-10-23. **Change a pattern in
Django only** — the browser picks it up from the payload.

Next + date needs a date phrase **and** an action word, or a labelled `Next:`
with 3+ words. "will revisit" alone scores nothing; that is intended.

## Access

Slug `crm.remarks_quality`, **enforced server-side** by
`HasRemarksQualityAccess` on all three endpoints: a non-empty
`individual_permissions` must contain the slug; an empty one falls back to the
role, using `REMARKS_QUALITY_BOOTSTRAP_ROLES` in Django, which mirrors this
tab's entries in `ROLE_TABS`. Keep the two in step. Anyone who already has a
permission list needs the slug backfilled (Admin > Users or the bulk-permissions
endpoint) — adding it to `ROLE_TABS` reaches nobody migrated.

Branch scoping is **enforced server-side**: role `admin` sees all branches,
everyone else only their assigned branches, and a non-admin with no branches
gets nothing (the tab shows a "No branches assigned" state and never fetches).
The header chip shows the active scope. The mount payload's rows and
walk-ins are limited to the caller's branches; `texts/` silently drops ids
outside them and `lead-history/` returns 403 for an out-of-scope cart. `decode()` still narrows to
`allowedBranches`; that is redundant now and harmless.

## Behaviour that is easy to break

- **Lead score** = pointers covered by a lead's *best single* remark in the
  filters (toggle: all its remarks OR-ed). BM rows score only that BM's remarks.
- **Copy-paste** = same author, same day, same text after stripping case and
  non-alphanumerics (`th` = Postgres `hashtext`), on 2+ different leads. Texts
  at the "Nothing" length are never counted as copies.
- **Order Lost** leads are excluded unless toggled on or picked in Status.
- **Report cards** ignore the date filter; "Remarks filled" ignores *every*
  filter (it is walk-ins that got a typed remark the same day). With "Skip leads
  already covered 4/4 earlier", a lead whose single remark hit 4/4 on an earlier
  day — across all 95 days, not just the filtered rows — drops out of later days.
- **BM scorecard Δ** compares against the immediately preceding window of the
  same length, and needs 3+ leads in it.
- The prototype's per-card "⬇ PNG" export was dropped: it loaded html2canvas
  from a CDN, which this repo has no dependency for. Cards are sized to screenshot.
