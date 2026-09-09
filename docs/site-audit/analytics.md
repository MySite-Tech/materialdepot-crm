*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## Analytics: two halves, two sources, one page

Site Audit → Analytics is five tabs over two databases that are never mixed in one number
(ported from `material-depot-site`'s Admin console Analytics V3, 2026-08-26):

| Tab | Source | Where |
|---|---|---|
| **Execution** — bookings, executions, TAT, arrival on time, NPS | ops DB (Site Audit Supabase) | `components/site-audit/views/analytics/index.tsx` |
| **Category · Week on week · Penetration · Targets** — carts, orders, order value, attach rate, audit→order conversion, store penetration, targets | the ORDER BOOK (`materialdepot_azure` via Metabase) | `components/site-audit/ui/cat-analytics-panel.tsx` + `public/md-cat-analytics.js` |

**Three surfaces now report field-service NPS, and they do not all read the same source** — worth
settling before editing any of them, because "add NPS analytics" could plausibly mean any of the
three. Execution (here) joins the **`ratings` projection** to the order; Category Ops →
⭐ Review scores and Category Ops → 📊 NPS analytics both compute from the **call logs**, the
record itself. So the COE tabs are the superset by construction: a score whose projection POST
failed counts there and not here, which is exactly the gap `unprojectedScoredCalls` exists to find
and repair. Verified 2026-09-01 — 41 scored calls in the logs, 41 `ratings` rows dated on or after
2026-08-31, **zero unprojected** — so they agree today; they are not guaranteed to, and a report
that "the two NPS numbers differ by a few scores" is this, in that direction only, and is fixed
from the ⭐ Review scores tab rather than in code.

An order lives in the order book, a site visit lives in Supabase, and **the only bridge between
them is the customer phone number** — which is why the two halves are separate tabs with separate
footnotes, and why no tile adds a booking count to an order count. `components/site-audit/views/analytics/index.tsx`
holds both the Execution view and the shell that renders the tab bar and picks between them.

**`public/md-cat-analytics.js` is a VERBATIM copy of the file with the same name in
`material-depot-site`** — registry, dummy data layer, target model and all four tab renderers, as
a self-contained IIFE that publishes on `window` and touches no DOM, no network and no framework.
That is what makes it shareable byte-for-byte instead of hand-rewritten into JSX. **Fix it in one
repo, copy it to the other; do not fork it** (same rule as the two copies of the job-card category
registry). It is loaded on demand by `components/site-audit/data/cat-analytics.ts` — only when a commercial tab is actually
opened — so its 127 KB never reaches the main bundle. The Execution tab loads it too, in the
background, purely for `mdAnGrouped`/`mdAnTatHtml` so the bookings and TAT charts match the
commercial ones; a failed load costs those two blocks, never the ops numbers.

Because the renderers return **HTML strings**, three things follow:

- They need the Admin console's CSS, which lives at the bottom of `app/globals.css` **scoped under
  `.md-an`**, with the palette variables on `.md-an` rather than `:root` so none of it reaches the
  Tailwind side of the CRM. Any wrapper that injects this HTML must carry that class.
  One deliberate un-reset: Tailwind preflight's `svg { max-width: 100% }` is switched off inside
  the scope, because the charts already decide their own scaling.
- The tab bodies carry the module's own inline `onclick`/`onchange` handlers (`anDrill`, `anCsv`,
  `anTargetInput`, `anSaveTargets`, …), so `CatAnalyticsPanel` publishes exactly those names on
  `window` while mounted and **restores the previous values on unmount** — two mounts (rail plus a
  Role Viewer preview) must never leave a handler pointing at an unmounted panel. Anything those
  handlers read comes from a ref, or a CSV export would keep exporting the range the tab opened on.
- Targets are edited in a **mutable ref** with a `nonce` bump to redraw, not in state. That is
  deliberate: an edit touches one cell of a 7-month × 13-store × 6-category object, nothing is
  written until Save, and abandoning the tab abandons the edits. Save writes the whole object to
  `app_settings.cat_analytics_targets`, shared with the Admin console.

**Every tile on the Execution tab is clickable and opens the rows behind it** (added 2026-08-26):
which orders met the criterion, which did not, who they were assigned to, the booked slot vs the
actual arrival time, and a CSV. `M.drills` in `components/site-audit/views/analytics/index.tsx` is the registry; `DrillRow.hit`
is `'yes'` (numerator) / `'no'` (rest of the denominator) / `'na'` (genuinely neither — a Neutral
rating, or a signature that could not be read, which must never be folded into "no").

**The invariant: a drill's row set IS its tile's denominator, built off the same variable the tile
renders.** So the status and delivery drills iterate `iAttempts`, Job Card iterates only the
completed/partial attempts, MD Audit iterates distinct PIs, the ratings drills iterate the rating
map, and the arrival drills iterate the rows `_anArrivalStats` tags in the same loop that does the
counting. A drill that disagrees with the tile it opened from is worse than no drill — so when you
add a tile, derive its drill from the same variable, never from a fresh filter that looks right.
(`iNoDelayLog` is literally `iDelayLog` with the verdict inverted, for that reason.) The ratings
drills pass an explicit `summary`, because yes/(yes+no) there would be promoters over
promoters-plus-detractors — not NPS, not anything.

**Arrival counts one visit once, and did not used to.** `_anArrivalStats` now dedupes on
order + person + day. The field apps write the "arrived at site" log line more than once for a
single visit — 17 install and 30 audit person-day pairs on live data as of 2026-08-26, one audit
logged **20 times** — which was inflating the install arrival metric by 13% and the audit one by
23% (install went 53% → 56%, audit 60% → 63% when fixed). The PWA's Admin console has always
deduped this way; this port never did, and nobody could see it until the tiles started listing
their own rows. Any new metric read off `log` entries needs the same guard.

The install select carries `customer_name`, `bm` and `phone` **for the drills** — a list of enquiry
IDs does not answer "which orders". They are columns on `install_orders_slim`, so this costs no
extra query. Note the log enrichment uses `?? o.phone` rather than `|| null`: it only covers orders
created from 1 Jul 2026, and blanking the phone on older ones made them unmatchable against site
audits, i.e. a false "no audit".

**The commercial numbers are DUMMY right now, and the UI says so** — an amber "◆ Dummy data" badge
in the filter row plus a footer explaining every definition and limit. The generator is seeded from
the Jun–Aug 2026 category workbook and reconciles back to it exactly, so the figures are arithmetic,
not noise. It covers **1 Jun – 17 Aug 2026 only**, which is why the date pickers clamp to that
window (`clampToData`): today is past the cut, so an unclamped "this month" would render an empty
dashboard that reads as broken. **To go live: implement `MD_AN_SOURCE.metabase()` in
`public/md-cat-analytics.js` to return the shape `MD_AN_SOURCE.dummy()` returns (documented at
`MD_AN_ROW_CONTRACT` in that file) and flip `mode`.** Nothing in `components/site-audit/ui/cat-analytics-panel.tsx` or
`components/site-audit/data/cat-analytics.ts` changes — the badge, the footer and the clamp all read that flag themselves.

Two intentional differences from the Admin console version: city comes from the CRM's own header
selector (the `city` prop) instead of the filter row's own buttons, so there is one city control per
page; and the filter row is real React rather than an HTML string, because it is this app's chrome
rather than part of the shared dashboard. See also the `service_mgr` gate under Known landmines.

## Review scores → NPS: one pipeline, and where it leaks

Q1/Q2/Q3 (overall experience / staff / site cleanliness, 1–10) used to be
collected on-site, on the job card, handed to the client by the field worker
being rated — which biased every score upward. Collection moved to a Category
Ops phone call the day after the job: `components/site-audit/coe-ops/views/followups.tsx` for the audit's
D+1 checkpoint, `components/site-audit/coe-ops/views/install-reviews.tsx` for one checkpoint per completed
install sub-job. **This repo's own field apps kept writing on-site scores until
`c4f1296` (2026-08-24)**, four days after `material-depot-site` stopped, so the
live `ratings` table holds two populations with opposite bias — worth saying out
loud before anyone reads a trend across that date.

The chain, and what owns each link:

| Link | Where | Note |
|---|---|---|
| Source of truth | `coe_track.calls[].ratings` (audit) · `subjobs[].coe_review.calls[].ratings` (install) | append-only, inside jsonb this app already writes |
| Projection | `ratings` table (`postJobRating`) | a second copy, written for Analytics only |
| Bands | `npsFrom`/`npsBand` in `shared/format.ts` | ONE definition; see below |
| Read | `SiteAuditAnalyticsView` · `components/site-audit/coe-ops/views/review-scores.tsx` · `components/site-audit/coe-ops/views/nps-analytics.tsx` | all three read the same helpers |

**The `ratings` table is a projection, not the record.** The PATCH that saves
the call and the POST that projects it are two writes; the second can fail
alone. `components/site-audit/coe-ops/views/review-scores.tsx` is what closes that loop —
`unprojectedScoredCalls` diffs the call logs against the table and offers to
push what never landed. Two match rules, both needed: same order within 30
minutes of the call (the normal case, and tight enough that a pre-2026-08-24
on-site rating on the same order can't be mistaken for it), or same order plus
identical Q1/Q2/Q3 at any time (so an already-pushed score isn't offered
forever). Rows are consumed as they match, so two scored calls on one order
need two rows.

**Analytics joins ratings to the ORDER, never by `ratings.created_at`.**
`_anAttachAuditRatings` / `_anAttachInstallRatings`, ported from Admin.html.
While the field app wrote the score at signing time the two were the same set;
once collection moved to a D+1 call they came apart, and a created_at filter
lends a job's score to the period *after* the one it describes. The join also
de-duplicates — 13 audit orders in live data carry more than one rating, which a
date filter counts twice. Install is the awkward half: a rating's `order_id` is
the *parent* order, shared by every sub-job, so it's disambiguated by rated
installer email, then nearest completion date (only 3 rated orders live have 2+
completed sub-jobs, so this rarely bites). Consequence to expect, not fix: the
last few days of any range show fewer scores than jobs, because those D+1 calls
haven't happened yet.

**Two different NPS numbers live in this portal, and both are correct.** Site
Audit → Analytics, Category Ops → Review scores and Category Ops → NPS analytics
report *field-service* NPS on Material Depot's stricter house bands (promoter
9–10, neutral 8, **detractor ≤7**), matching Admin.html. The `crm.nps` tab
(`components/nps`) reports *store-visit* NPS from the Django footfall tracker on
textbook bands (detractor ≤6) — a different question of a different population.
Never average them, and never "fix" one to match the other; each names itself and
prints its bands on screen so a reader can't mistake which is on the page.

The trap here is now specifically **layout**, not arithmetic: `components/site-audit/coe-ops/views/nps-analytics.tsx`
deliberately borrows `components/nps`'s tile-and-chart layout because that is the
shape the business already reads — so the two pages LOOK alike while measuring
different populations on different bands. That is exactly why the house-bands
note sits in its filter row and the band names ride on the promoter/neutral/
detractor tiles themselves. Don't tidy those labels away, and don't copy
`components/nps`'s `bucketOf`/`catOf` (textbook) into the Site Audit side while
borrowing its components.

**Job Card & Signature % is measured from the signature**, not from "a rating
exists". That proxy was only ever true while the field app wrote the rating at
signing time. Audit reads `audit_ticked->sign->>name`, install reads
`subjobs[].jobcard.sign`.
