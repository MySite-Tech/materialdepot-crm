*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## The COE dashboard's six tabs, and the three things they share

`SiteAuditCoeView` does ONE data load (`audit_orders` completed + `install_orders_slim`
+ `wp_production` + `ratings`) and hands the same in-memory rows to every tab, so a
number on one tab can never disagree with another. Six tabs as of 2026-09-01:
Audit Follow-ups · Install Reviews · ⭐ Review scores · 📊 NPS analytics ·
Custom wallpaper · Where it stalls.

Three things are shared deliberately, and each of them is shared because the
alternative was two copies that drifted:

**One category vocabulary** (`coe-ops/shared.ts`). `CAT_FLOORING` / `CAT_WALLPAPER` /
`CAT_CUSTOM_WP` / `CAT_WALLPANEL` / `CAT_CNC`, plus `CAT_UNSET` which is a FILTER
bucket, not a category. Audits resolve through `auditCategories`, install sub-jobs
through `subjobCategory`. Both tables' category column and both category filters read
these, so "Flooring" on one tab and "Wooden Flooring" on the other can't split one
material into two filter entries. Two traps live in here:

- **A completed audit's categories are only in `audit_ticked`, and that column is the
  whole job card.** `service.flooring`/`service.wallpaper` — what `categoriesFor` used
  to read alone — is empty on 318 of 330 live completed audits, and 317 of them carry
  no non-audit SKU either, so the old fallbacks answered 12 rows out of 330 and the
  column was `—` for everyone else. `audit_ticked` answers 303. So there is a second,
  separate query (`AUDIT_TICKED_QUERY`, ~1.2 MB / ~1.4s) which is **not in the 30s
  poll**: a completed audit's job card is terminal, so `SiteAuditCoeView` asks once and
  then only again when an order appears that it has no answer for. Last good answer in
  a ref, fire-and-forget, fails quietly — same shape as `SiteAuditOpsView`'s own
  `AUDIT_CATEGORY_QUERY`, and for the same detoast reason. **Do not "simplify" this by
  adding `audit_ticked` to `AUDIT_COLS`.**
- **A room with neither `category` nor `type` is skipped, not defaulted.**
  `categoryFor`/`typeLabel` both fall back to flooring; 45 live rooms have neither, and
  defaulting them invents a material the auditor never ticked. They land in
  `CAT_UNSET` (27 audits), which is filterable and honest. Likewise `custom_wp` is a
  flag on the install ORDER while its sub-job still reads `wallpaper` — miss that and
  this filter disagrees with the Custom wallpaper tab about which installs are custom.

**One date-range vocabulary** (`DATE_PRESETS`/`presetRange`/`inDateRange`/
`previousRange`). Ranges are inclusive both ends, compared as `YYYY-MM-DD` strings,
and `{from:'',to:''}` IS "all time" so there is no separate no-filter flag. A row with
no date is in the unbounded range and out of every bounded one — it can't be claimed
for a window nobody can place it in. `previousRange` abuts the range without
overlapping it, which is what the NPS deltas rest on.

**Filter order, which is not cosmetic: date + category → buckets → search.** The
bucket tiles are the denominator the COE works the queue by, so they count what the
date and category filters leave; "3 Overdue" above a table of 40 rows is worse than no
tile at all. Search is the one filter the tiles deliberately ignore — typing a name
should narrow the list, not renumber the queue. Both queues also keep the invariant the
buckets always had: they partition the filtered set and sum to its total.

**The frozen bar** (`coe-ops/filters.tsx`) pins the filters and bucket tiles while rows
scroll under them. Its `top` is **measured, never hard-coded**: each host that mounts
this dashboard has its own sticky header at a height this component can't know —
the CRM shell's is a fixed 48px, `/site-audit-view`'s wraps and changes with the window
— so `useFrozenBar` walks up the ancestors summing the heights of preceding siblings
that are pinned to the top. **The table's `<thead>` is deliberately NOT sticky, and
can't be:** the wrapper around it is `overflow-x-auto`, which makes that wrapper the
sticky scrollport rather than the document, so `sticky top-N` on a header cell doesn't
pin to the viewport — it shifts the header row N pixels DOWN over the first rows (this
was live for one iteration and looks exactly like a rendering bug). CSS won't let the
wrapper scroll on one axis only, either: `overflow-y: visible` next to
`overflow-x: auto` computes back to `auto`. The frozen bar works because it sits
outside that wrapper.

### Every cart on the client's number (`components/site-audit/coe-ops/views/client-carts.tsx`)

Both call queues' drawers show all of a client's CRM deals for their phone —
`/crm/leads/?q=<phone>`, the same rows the Leads tab renders. It exists because
`orderPlacedFor` can only see an INSTALLATION order, so a client who took a site audit
and then bought tiles, wallpaper and laminates as separate product carts read as "Not
yet", and the COE had to leave the dashboard and search the number by hand.

It inherits both of `components/site-audit/data/conversion-funnel.ts`'s rules verbatim. `q` is a free-text search
that also matches names and cart ids, so results are **re-filtered on `phoneKey`** — a
client whose name contains the digits must not inherit somebody else's deals. And a
failed request is reported as **unreadable, never as "no carts"**: telling a COE a
client walked away when they have already paid is the most expensive wrong answer this
panel could give. Deals are SPLIT by the anchor day rather than filtered to it (all of
them is the ask), with the earlier ones labelled history and never counted as this
job's conversion — the same scoping rule `funnelFor` enforces.

Note this panel puts a Django call behind a drawer open, so on `/site-audit-view`
(which never authenticates) a 401 from it will `forceReLogin()` and drop the preview
session. Stub the Django host to exercise it — see *Auth, and why a fake session won't
work*.

### 📊 NPS analytics (`components/site-audit/coe-ops/views/nps-analytics.tsx`)

Field-service NPS over a picked date range, laid out like `components/nps`'s
store-visit dashboard because that is the shape the business already reads. Three
things it does NOT do, each for a reason recorded elsewhere in this file: it uses the
house bands via `npsFrom`/`npsBand` (never textbook — and prints them on screen); it
computes from `scoredCalls` over the CALL LOGS, never from the `ratings` projection, so
it and ⭐ Review scores cannot disagree; and it therefore dates a score by the day the
COE MADE the call, not by `ratings.created_at`.

Coverage on that tab is deliberately **all-time, not range-scoped** — it is "every
review currently owed", the same denominator the Overdue buckets show — and it says so
on screen.

Two rendering rules worth keeping: a day with no calls is a BREAK in the trend line
(`connectNulls={false}`), not a zero, because interpolating it invents scores; and
"NPS by rated staff" is a div-based diverging bar list rather than a Recharts
`BarChart` because **a bar chart draws nothing at all for a value of exactly 0** — no
bar, and it skips the label too — and worst-first sorting puts precisely that row at
the top, so the one person a reader most needs to see was the one row with nothing on
it.
