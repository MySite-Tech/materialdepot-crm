# materialdepot-crm

Next.js 16 (App Router, Turbopack) + Tailwind CRM portal for Material Depot.
`app/page.tsx` is a `<Suspense>` wrapper around `components/crm`, whose
`index.tsx` renders every tab.

`README.md` is a leftover Vite template and describes nothing about this repo —
ignore it.

```bash
npm run dev        # next dev  (a dev server is often ALREADY running on :3000 —
                   #  check before starting; a second one exits with "Another
                   #  next dev server is already running")
npm run build      # next build
npx tsc --noEmit   # typecheck — fast, run this before claiming a change compiles
```

`npx eslint <file>` reports "File ignored because no matching configuration"
for `app/` and `components/`, and `npm run lint` is dead too — it still runs
`next lint`, which Next 16 removed ("Invalid project directory provided, no such
directory: .../lint"). There is currently **no working lint command**; `npx tsc
--noEmit` is the only automated check.

## Docs, and why this file is short

This file is loaded into **every** session, so it holds only what applies
repo-wide: the layout rule, the request budget, the deploy path and house style.
Everything module-specific lives in `docs/`, which is read on demand.

Every module is documented. Each doc opens with a **Data** table mapping each
call to its endpoint, so "where does this number come from" is answerable without
reading the module.

| Module | Doc | What it holds |
|---|---|---|
| Site audit / installation ops | `docs/site-audit/context.md` | Three overlapping role models, the roster, order attribution, the BM order book, conversion, analytics, NPS, the COE tabs |
| B2B sales CRM | `docs/b2b/context.md` | Inbound (PRD + three systems holding one lead), Outreach, Leads, Client Database, KAM, and the `lib/b2b` data layer |
| App shell / auth / tabs | `docs/crm-shell/context.md` | Login, session restore, the 13-tab permission gate |
| Django/Kylas client layer | `docs/api-layer/context.md` | `mdFetch`'s envelope unwrap, 8s GET dedupe, single-flight token refresh; the server cache and rate limiter |
| Retail overview + Order Lost | `docs/dashboard/context.md` | `/crm/dashboard/`, reason buckets, the 3,000-row detail cap |
| Footfall | `docs/footfall/context.md` | Five endpoints, the funnel, repeat buckets, the data-driven breakdown grid |
| NPS | `docs/nps/context.md` | Promoter/passive/detractor cutoffs, the NPS formula, per-customer dedupe |
| Report card | `docs/report-card/context.md` | One call, six sections; `has_bm`; cart temperature vs closure stage |
| Weekly funnel | `docs/weekly-funnel/context.md` | Fixed value buckets, column-dynamic category tables, the shared filter-option calls |
| Appointment tracker | `docs/appointment-tracker/context.md` | Kylas feed via a route handler, the rota table, EC-ready being per-browser, fuzzy branch matching |
| Store visit | `docs/store-visit/context.md` | One endpoint doing lookup and write, the whole-body Kylas lead update |
| Store display | `docs/store-display/context.md` | Movement lifecycle, the hardcoded store↔branch-id map, the image transform proxy |
| Sales dashboard | `docs/sales-dashboard/context.md` | Raise/escalation tabs; contact→deals in one request |
| Shipped-and-fixed bugs | `docs/landmines.md` | 41 bugs already fixed here, kept because the shape recurs. **Not only site-audit** — it also holds the `42703` missing-column signature, the roster's probe-gated columns, the permissions drift, the lost-photo state-updater bug, duplicate log writes, and why an empty `allowedBranches` means all branches |
| The three backends | `docs/backends.md` | Django vs CRM Supabase vs Site Audit Supabase, and the hardcoded creds |
| Supabase DDL | `supabase/migrations/README.md` | Which project each `.sql` targets, and which were never applied |

### A code change is not done until its doc matches

**IMPORTANT: when you change behaviour that a `docs/` file describes, update that
file in the same commit as the code.** Not afterwards, not in a follow-up. A doc
that describes last month's behaviour is worse than no doc, because the next
session will trust it.

Concretely:

- Changed how a module behaves → edit its `context.md` in the same commit.
- Fixed a bug whose *shape* could recur → add an entry to `docs/landmines.md`,
  with the date and what the wrong behaviour looked like from the user's side.
  Those entries cross-reference each other, so keep them in that one file.
- Added a module → create `docs/<module>/context.md` and add a row to the table
  above.
- Found a doc line that is now wrong → delete or fix it. Removing a stale line
  counts as much as adding a true one.

What **not** to write: anything derivable by reading the code. Prose that
restates the file tree, describes what a component renders, or lists props makes
these docs worse — it costs context on every read and buries the parts that are
load-bearing. Record the non-obvious: why a thing is done the odd way, what
breaks if you change it, what was already tried and failed, and which numbers
were verified against real data.

The house style below applies to code; this section applies to the docs. Both
are enforced by review, not by tooling — there is no lint step in this repo.

### Locate before you read

`grep -rl "<term>" docs/` costs one cheap tool call. Opening the wrong doc costs
up to 12,000 tokens, and `docs/site-audit`, `docs/b2b` and `docs/landmines` are
each big enough that reading one you didn't need is the most expensive mistake
available here. Grep first, then read the doc that matched — with `offset`/`limit`
around the matching section when the file is large.

Answers are often not in the doc whose name matches the topic. `docs/landmines.md`
in particular holds facts about the roster, permissions, uploads and branch
resolution that you would look for elsewhere.

**Never read these whole — they are machine-generated and will flood the
context:** `tsconfig.tsbuildinfo` (~83k tokens), `package-lock.json` (~43k),
`public/md-cat-analytics.js` (~32k, a bundled vendor script). Grep them if you
must; do not open them.

## Folder structure — one pattern, everywhere

Every module, at every depth, has the same shape:

```
<module>/
  index.tsx        entry (the component/API the module is imported for)
  constants.ts     module-scoped constants     -> constants/<name>.ts once there are 2+
  types.ts         module-scoped types         -> types/<name>.ts    once there are 2+
  utils.ts         pure helpers                -> utils/<name>.ts    once there are 2+
  hooks/           always a folder: one use-*.ts per hook
  <domain>/        sub-module, same shape recursively
  ui/              leaf presentational pieces with no domain of their own
```

Rules, all of which the repo currently satisfies:

- **Filenames are kebab-case,** `app/` included. Next.js only owns the *reserved*
  names there (`page.tsx`, `layout.tsx`, `route.ts`, `manifest.ts`); anything
  colocated alongside them is a normal file and follows the rule —
  `app/pwa-register.tsx`, not `app/pwa-register.tsx`.
- **No `shared.ts` grab-bags.** A file mixing constants + types + helpers is the
  thing this layout exists to prevent; `install-ops/shared.ts` (388 lines) and
  `audit-ops/shared.ts` (301) were split into `constants.ts`/`types.ts`/`utils.ts`
  and their 36 import sites pointed at the specific module. A module's barrel is
  `index.ts`, never `shared.ts`.
- **`.ts` unless the file contains JSX**, then `.tsx`.
- **Hooks live in `hooks/`,** one per file, named `use-*`. A function containing
  a hook call must itself be named `use*` — including the action factories
  (`useLeadsView`, `useAuditDrawerActions`), which is why some are `use*` and
  others `make*`.
- **Keep a directory at 5 files or fewer.** Support files (`index`, `constants`,
  `types`, `utils`) plus one domain folder is the usual shape. Two `cards/`
  folders sit at 7 because one card per file is the point; don't split those
  just to hit the number.
- **Constants/types/utils belong to the module that uses them.** A role file
  moves up to the feature root only when more than one sub-module imports it
  (`components/b2b/constants/ui.ts` is shared by `drawers/` and `views/`).
- **No re-export-only wrapper modules.** `index.ts` as a module's public API is
  fine (`components/site-audit/shared/index.ts`, `lib/api/index.ts`); a second
  file next to it that merely re-exports it is not — six of those were deleted
  and their importers pointed at the real modules.
- **No comments.** They were removed repo-wide deliberately; the archive is at
  `/tmp/comment-archive.json`. Don't reintroduce them without being asked.

`lib/` follows the same rules: `lib/api/{core,crm,dashboards,b2b,ops}/`,
`lib/b2b/{mappers,data,leads,orders,stats}/`. **`lib/api/index.ts` is the barrel
every Django call goes through** — it used to be `lib/mock-api.ts`, which was a
misnomer (nothing in it is mocked).

## Requests: a page gets ten, and no loops

**A page may issue at most ten requests on mount.** That is a budget, not an
aspiration — the B2B Dashboard was at ~181 and the Kylas proxy was answering
429s. Where the tabs stand now, counted by hand: B2B Dashboard 7 (8 on Last
Month / All Time), KAM 3, Client Database 2, Leads 2, Inbound 2, Outreach 1.
If a change pushes a page over ten, the change is wrong, not the budget.

**There are four ways out of this app and there must never be a fifth.**
`mdFetch` (Django), `kylasFetch` (Kylas), `sbGet`/`sbGetPaged`/`supabase.from`
(both Supabase projects), and a direct `fetch()` to this app's own
`app/api/*` route handlers. No axios, no XHR, no sockets. Route every new call
through the wrapper for its backend so the caching and auth-refresh below apply.

**`mdFetch` de-duplicates identical GETs for 8s** and any non-GET clears that
cache (`lib/api/core/client.ts`). Kylas and the `app/api/*` routes have no such
cache, so a repeated Kylas call is a repeated network request — which is why
`fetchLeadsByPhone` keeps its own per-phone promise map.

**Never put a request inside a loop over rows.** If you are reaching for
`for (const row of rows) await fetch…` or `Promise.all(rows.map(fetch…))`, the
answer is a bulk endpoint, and four already exist as precedent:
`/crm/leads/client-order-history/` (many phones), `/crm/leads/?enquiry_ids=`
(many enquiry ids), `/crm/leads/stats/?bm_groups=` (many BM groups, plus
`total_branch` for an unfiltered slice alongside them), and
`/crm/leads/b2b-bulk/` (histories and deals in one). Adding a backend endpoint
is cheaper than 200 round trips. Before you write the loop, check whether the
field is *already in the response you have* — the Raise screen fetched
`/api/deals/{id}` once per deal for an `associatedContacts` value that
`SEARCH_FIELDS` had already asked Kylas for, up to 200 times per contact tap.

The loops that are legitimate: paging a source that has no bulk form
(`fetchAllRows`, `for (let page = 0; ; page++)`), batching a bulk call to its
server-side cap (`HISTORY_BATCH = 300`), a bounded retry, and a user-triggered
CSV import/export. Those all need a **cap or a page cursor** — never an
unbounded fan-out over whatever the server returned.

**Fetch for the tab that is open, nothing else.** Every nav level renders one
panel at a time (`{effectiveTab === x && <View/>}` in `crm/shell/tab-panels.tsx`,
the B2B sidebar in `views/b2-b-sales-crm.tsx`, the Site Audit rail in
`views/rail/index.tsx`) so a view's effects cannot run for a tab nobody opened.
Keep it that way: do not hoist a fetch into a shared parent to "warm" it.

**Split load effects by what they actually depend on.** The B2B Dashboard has
`loadBase` (no deps) and `loadRange` (`[range]`) because only the two stats
calls take a date range; before the split, every click on Last Month re-fetched
the Kylas board, the owner totals, the row read and the client histories — nine
requests to change two numbers.

**Polling is 30s or slower and gated on visibility.** The shape, used by all
twelve pollers: `setInterval(() => { if (!document.hidden) load(); }, 30000)`
plus a `visibilitychange` listener that refreshes on focus, and a cleanup that
clears both. A background tab must be silent.

**Never present a failed request as data.** This is the one that bites hardest,
because the wrong version looks fine. A dropped client-history call must leave
those clients reading **Unknown**, not **Inactive** — so `fetchB2BBulk` returns
an `ok` flag, `orderDatesFromAggregates(…, ok)` puts it in `loaded`, and
`clientStatus` turns `loaded: false` into Unknown. Two related traps:

- **A failure must not be cached as a zero.** `orderHistoryCache` has no TTL, so
  zero-filling a phone we never got an answer for would pin it at zero until a
  full page reload — the Refresh button would not clear it. `zeroFill` takes a
  `cache` flag for exactly this.
- **`kylasFetch` wrappers swallow errors.** `fetchB2BInboundLeads` returns
  `total: 0` on a 429, indistinguishable from "no leads". Never derive one
  number from another across that boundary: deriving the second owner's total as
  `boardTotal − firstOwner` silently moved one rep's leads onto another's card,
  so both owners are fetched even though it costs a request.

**A backend aggregate needs a deterministic `ORDER BY`.** `firstOrderValue`
flipped between page loads for clients with two orders on one day because the
history queryset had no ordering at all. Any "first"/"last" derived server-side
gets `.order_by(...)` with a tiebreak (`('created_at', 'id')`).

**Ship the backend first.** A frontend that reads a new field or endpoint must
not deploy before the Django change — `b2b-bulk` 404s against an old API, and
the zero-caching above then makes the damage outlast the deploy. `total_branch`
is the pattern to copy for a *graceful* addition: the frontend falls back to the
old call when `branchTotal` is absent.

### Before you call a request change done

`npx tsc --noEmit` and `npm run build` are the only automated gates in this repo
(no lint, no tests), and neither one sees any of the above. So also:

- **Count the requests in DevTools**, filtered to `apiV1|kylas|supabase`. Static
  analysis cannot do this — four separate attempts at a per-page counter all
  produced contaminated numbers, because generic names (`load`, `post`,
  `confirm`) are defined in many modules and collide in any global name map.
- **Check the failure path**, not just the happy one. Break the call (offline, or
  a bad URL) and confirm the UI says "unknown" rather than showing a confident
  zero.
- **Diff against `origin/main`, not your branch**, before claiming parity —
  `main` has run ahead twice, and a restructured file that `main` also edited
  merges as a delete/modify conflict that silently drops `main`'s fix.

## Git, and what actually deploys

`origin` = `MySite-Tech/materialdepot-crm` (a fork), `upstream` =
`manishgmr/materialdepot-crm`. Feature work happens on `Installation-Changes`.
A teammate pushes to this branch regularly — **pull before starting.**

**`main` is the deployed branch, and it can be AHEAD of `Installation-Changes`.**
Pulling the feature branch is not enough: the teammate merges to `main` and
keeps pushing there, so `git log HEAD..origin/main` is the check that matters
before touching a shared file. On 2026-09-03 `origin/Installation-Changes` was
up to date while `main` was 5 commits ahead carrying a 498-line rewrite of
`components/site-audit/staff/users/index.tsx` — building on the branch as-is would have re-reverted
it, which is precisely the drift this file records happening twice already.
Merge `origin/main` in first; the conflicts are usually just import lines.

Deployment is **Azure Static Web Apps CI/CD**
(`.github/workflows/azure-static-web-apps-gentle-meadow-00fe92000.yml`), which
triggers on **push to `main`** — a PR to `main` builds a preview, and merging it
is the deploy. Every commit on `main` so far is a PR merge from
`Installation-Changes` (#3–#6), so that is the route; pushing straight to `main`
deploys with no review and reverting means another push to `main`.

Two things about that workflow are worth knowing before you touch config:

- It injects only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  as secrets. The **Site Audit** project's URL and anon key are not there and
  do not need to be, because `shared/sb-client.ts` hardcodes them (see *Three
  backends* below). "Move the Site Audit credentials into env vars" is
  therefore a two-repo change that also needs a GitHub secret added, not a
  tidy-up — do it and the field apps break on the next deploy.
- `vercel.json` is tracked and `.vercel/` sits locally (gitignored), so the
  repo looks Vercel-deployed. The workflow above is the deploy path visible in
  the repo. Don't infer the hosting from those files.
- `tsconfig.tsbuildinfo` is gitignored and untracked (it was tracked until
  2026-09-09 — 330 KB of build artifact in every diff). `"incremental": true`
  still regenerates it locally. Don't re-add it.

`main` has run **ahead of `Installation-Changes` twice**. Always
`git fetch && git log HEAD..origin/main` before you merge or claim parity. If
`main` edited a file this branch restructured away, git reports a
`modify/delete` conflict — resolve it by **porting `main`'s change into the new
location first**, then keeping the deletion. Taking "our" side blindly reverts
whatever `main` fixed (it nearly lost `e2d0eaf`, the revenue-donut colour fix).

## House style

- **Do not write explanatory comments between lines of code.** No narration, no
  restating what the next line does, no verbose JSDoc. If a line encodes a
  non-obvious constraint, that belongs in the module's `docs/` entry, where it is
  searchable and cannot drift out of sync silently. A comment is acceptable only
  where the code cannot carry the fact at all — a magic value from an external
  system, or a deliberate no-op — and then it is one line.
- Prefer soft-gate-and-surface over hard-blocking: when data is missing, say
  what's missing and who fixes it (see the amber notices in
  `SiteAuditBranchManagerView`) instead of rendering a bare empty list.
- Reuse the existing status/stage registries (`install-ops/shared.ts` `STATUS`,
  `components/site-audit/coe-ops/wallpaper/track.ts`) rather than re-declaring labels.
- New Site Audit drawers are built from `components/site-audit/ui/drawer-ui.tsx` (`DrawerShell`, `Sec`,
  `KV`) rather than a fresh copy of the slide-over markup — `Sec`/`KV` had
  already been duplicated into two drawers before it existed.

- **`{expr} word` at the end of a wrapping JSX line silently loses the space.**
  Turbopack's JSX transform stripped the leading space off a text node that
  begins right after an expression and then wraps, so

  ```jsx
  so {n === 1 ? 'it counts' : 'they count'} as
  ₹0 here.
  ```

  rendered as "they count**as** ₹0 here" — confirmed by reading the DOM text
  nodes, not guessed. It does **not** fire on every such line (a neighbouring
  one three lines up kept its space), so do not try to predict it: whenever a
  space sits between `}` and text that wraps, write it as `{' '}`. Two of these
  reached the rendered page in the Client Database / Dashboard copy before
  anyone looked at it; the rest of that shape was converted defensively rather
  than after being seen to break, because the trigger is not predictable. The
  quick check is to render the panel and grep its `innerText` for a digit jammed
  against a word.

- **`ExportButton`'s `disabled` prop means "an export is running", not "there is
  nothing to export".** It renders a spinner and the word "Exporting…" when
  true, so passing `!rows.length` makes an empty tab claim it is mid-export.
  Every caller passes only its own `exporting` flag.
