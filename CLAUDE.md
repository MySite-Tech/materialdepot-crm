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
| Site audit / installation ops | `docs/site-audit/` | Split into `roles` · `staff` · `orders` · `analytics` · `coe` · `gotchas`; `context.md` is the pointer table |
| B2B sales CRM | `docs/b2b/` | Split into `inbound` · `outreach` · `leads` · `client-db` · `kam` · `data-layer`; `context.md` is the pointer table |
| App shell / auth / tabs | `docs/crm-shell/context.md` | Login, session restore, the 14-tab permission gate |
| Django/Kylas client layer | `docs/api-layer/context.md` | `mdFetch`'s envelope unwrap, 8s GET dedupe, single-flight token refresh; the server cache and rate limiter |
| Retail overview + Order Lost + Category Revenue | `docs/dashboard/context.md` | `/crm/dashboard/`, reason buckets, the 3,000-row detail cap, the Core/Non-Core/Special registry and why its rows are stores |
| Footfall | `docs/footfall/context.md` | Five endpoints, the funnel, repeat buckets, the data-driven breakdown grid |
| NPS | `docs/nps/context.md` | Promoter/passive/detractor cutoffs, the NPS formula, per-customer dedupe |
| Store hierarchy | `docs/org-hierarchy/context.md` | The seven-rung ladder and who may see whose numbers. **Reuse this rather than re-deriving "who is under me"** — visibility is `depth` + branch overlap, `reportsTo` is display-only, and four of the rungs may not exist in Django yet |
| Report card | `docs/report-card/context.md` | Your own card plus a team performance table scoped to the hierarchy; the two bulk calls that replace one-request-per-person; `has_bm`; cart temperature vs closure stage |
| Weekly funnel | `docs/weekly-funnel/context.md` | Fixed value buckets, column-dynamic category tables, the shared filter-option calls |
| Appointment tracker | `docs/appointment-tracker/context.md` | Kylas feed via a route handler, the rota table, EC-ready being per-browser, fuzzy branch matching |
| Store visit | `docs/store-visit/context.md` | One endpoint doing lookup and write, the whole-body Kylas lead update |
| Store checklist | `docs/store-checklist/context.md` | The daily EC checklist: stable item ids as jsonb keys, the merging RPC, per-role backdating, store codes not branch names |
| Store display | `docs/store-display/context.md` | Movement lifecycle, the hardcoded store↔branch-id map, the image transform proxy |
| Sales dashboard | `docs/sales-dashboard/context.md` | Raise/escalation tabs; contact→deals in one request |
| Shipped-and-fixed bugs | `docs/landmines.md` | 43 bugs already fixed here, kept because the shape recurs. **Not only site-audit** — it also holds the `42703` missing-column signature, the roster's probe-gated columns, the permissions drift, the lost-photo state-updater bug, duplicate log writes, and why an empty `allowedBranches` means all branches |
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

**A doc is only useful if it is read before the edit, not after.** "Read on
demand" failed exactly once in the obvious way: a session made a seventeen-file
B2B change, then read `docs/b2b/` only when it came to update it — by which
point the decisions in there had already been re-litigated from scratch.
`.claude/hooks/docs-brief.sh` is a PreToolUse hook on `Edit|Write` that names
the module's docs the first time a session touches a documented file. It fires
**once per module per session** and never blocks — it puts the pointer in
context at the moment of the edit, which is the only moment it helps.

**And the parity rule is enforced, not advisory.** One script,
`.claude/hooks/docs-guard.sh`, runs from three places and fails when a module in
the table above changed with nothing under its `docs/` path changing:

| Layer | Trigger | Scope | Bypass |
|---|---|---|---|
| Claude Stop hook (`.claude/settings.json`) | Claude tries to end a turn | working tree + commits ahead of upstream | say the change is doc-neutral |
| `.githooks/pre-commit` | any `git commit`, human included | staged files | `git commit --no-verify` |
| `.github/workflows/docs-guard.yml` | PR to `main` | `origin/<base>...HEAD` | `docs-neutral` PR label |

Only the CI layer can actually block a merge; the other two are fast feedback.
The pre-commit hook needs `core.hooksPath` set — `npm install` does it via the
`prepare` script, or run `npm run prepare` once.

It also greps changed sources for two request-budget violations that are cheap to
detect: `axios`/`XHR`/`WebSocket` egress, and `` `PREFIX-${Date.now()}` `` record
ids. The rest of `request-budget` (the ten-request budget, no-requests-in-loops,
failures rendering "unknown") is printed as a reminder and still needs a human.

Two design points worth not undoing. The Claude layer reads **commits as well as
the working tree**, because the rule is "same commit" and code committed
mid-session still needs its doc — a working-tree-only check passes a clean tree
that just committed undocumented code. And the script **checks its own MODULES
table against the filesystem**, because renaming a `docs/` directory would
otherwise un-match a row and silently disable that module's guard.

Added 2026-09-10, after a session read this rule, shipped a seventeen-file B2B
change, and updated no doc at all. Text in this file was not enough on its own.

What **not** to write: anything derivable by reading the code. Prose that
restates the file tree, describes what a component renders, or lists props makes
these docs worse — it costs context on every read and buries the parts that are
load-bearing. Record the non-obvious: why a thing is done the odd way, what
breaks if you change it, what was already tried and failed, and which numbers
were verified against real data.

The house style below applies to code; this section applies to the docs. Both
are enforced by review, not by tooling — there is no lint step in this repo.

### Locate before you read

`grep -rl "<term>" docs/` costs one cheap tool call; reading a doc you didn't
need costs thousands of tokens. Grep first, then read only what matched.

The two largest modules are **split into topic parts** for exactly this reason —
`docs/site-audit/` and `docs/b2b/` each have a 19-line `context.md` pointer table
and six parts of 45–190 lines. Read the part, not the module. `docs/landmines.md`
stays one file because its entries cross-reference each other; it opens with a
**Contents** list of all 43 titles, so grep a title and read around the line you
hit.

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

- **Filenames are kebab-case,** `app/` included. Next.js owns only the *reserved*
  names there (`page.tsx`, `layout.tsx`, `route.ts`, `manifest.ts`); anything
  colocated beside them is a normal file — `app/pwa-register.tsx`, never
  `pwaRegister.tsx`.
- **No `shared.ts` grab-bags.** A file mixing constants + types + helpers is what
  this layout exists to prevent. A module's barrel is `index.ts`, never
  `shared.ts`.
- **`.ts` unless the file contains JSX**, then `.tsx`.
- **Hooks live in `hooks/`,** one per file, named `use-*`. A function containing
  a hook call must itself be named `use*` — including the action factories
  (`useLeadsView`, `useAuditDrawerActions`), which is why some are `use*` and
  others `make*`.
- **Keep a directory at 5 files or fewer.** Support files (`index`, `constants`,
  `types`, `utils`) plus one domain folder is the usual shape. The two `cards/`
  folders sit at 7 because one card per file is the point — don't split those to
  hit the number.
- **Constants/types/utils belong to the module that uses them.** They move up to
  the feature root only when more than one sub-module imports them
  (`components/b2b/constants/ui.ts`, shared by `drawers/` and `views/`).
- **No re-export-only wrapper modules.** `index.ts` as a module's public API is
  fine (`lib/api/index.ts`); a second file beside it that merely re-exports it is
  not.
- **No comments.** Removed repo-wide deliberately — see House style for the two
  narrow exceptions.

`lib/` follows the same rules: `lib/api/{core,crm,dashboards,b2b,ops}/`,
`lib/b2b/{mappers,data,leads,orders,stats}/`. **`lib/api/index.ts` is the barrel
every Django call goes through** — it used to be `lib/mock-api.ts`, which was a
misnomer (nothing in it is mocked).

## Requests: a page gets ten, and no loops

**A page may issue at most ten requests on mount.** A budget, not an aspiration —
the B2B Dashboard was once at ~181 and the Kylas proxy was answering 429s. If a
change pushes a page over ten, the change is wrong, not the budget.

**There are four ways out of this app and there must never be a fifth.**
`mdFetch` (Django), `kylasFetch` (Kylas), `sbGet`/`sbGetPaged`/`supabase.from`
(both Supabase projects), and a direct `fetch()` to this app's own `app/api/*`
route handlers. No axios, no XHR, no sockets.

**A route handler has no session unless it asks for one.** Auth is a Django JWT
in `localStorage`, so anything under `app/api/*` is reachable by whoever can
reach the app. A route that holds a privileged key must call `requireCaller`
(`lib/server/session.ts`) and enforce scope with the same helpers the UI uses —
a check that lives only in the React component is not a check.

**Never put a request inside a loop over rows.** Reach for a bulk endpoint, or
check whether the field is already in the response you have.

**Never present a failed request as data** — a dropped call reads "Unknown",
never a confident zero.

The full rules — tab-scoped fetching, split load effects, visibility-gated
polling, the legitimate loop shapes, failure caching, deterministic `ORDER BY`,
backend-first deploys, and the pre-merge checklist — are in the
**`request-budget` skill**, which loads when you touch any of this. Read it
before changing a fetch; `tsc` and `build` cannot catch any of it.

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
- **Those two are the only env vars the repo can account for.** The server-only
  keys the `app/api/*` route handlers need — `SUPABASE_SERVICE_ROLE_KEY`,
  `KYLAS_API_KEY`, `API_BASE_URL` — are in `.env.local` here and in the Azure
  application settings there, and nothing in the repo shows whether a given one
  is actually set in the portal. A route that needs one builds and passes
  `tsc` either way, so a new service-role route can work locally and throw
  `… is not set` in production. Check the portal instead of the workflow file;
  see `docs/backends.md`.
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

### Optimised and concise, stated so you can actually apply it

"Write clean, optimised code" is not a rule anyone can follow or review against,
so these are the specific ones. Each exists because this repo has already paid
for it.

- **A table renders one page, not one row per record.** Anything that can hold
  more than ~50 rows paginates client-side: `PAGE_SIZE = 25`, a
  `Showing X–Y of Z` line, Prev/Next disabled at the bounds, and a reset to page 1
  when any filter changes. Copy `views/jobs/index.tsx` or
  `nps/dashboard/tabs/tracker.tsx`; do not invent a third shape. **The stat cards
  above a table keep counting the full set** — paging the rows must never change
  the totals. Jobs Overview put 900 `<tr>`s in the DOM before this rule.
- **One number, one function.** If a figure appears in two places — a tab badge
  and the tab's own list, a card and the table under it — both read the *same*
  exported function. Four badges drifted from the lists they labelled because
  each was re-derived inline; see the badge landmine.
- **Derive with `useMemo`, keyed on exactly what it reads.** A filter/sort/slice
  chain recomputed on every render is the usual cause of a sluggish tab. Equally:
  never depend on an array whose identity changes each render — key on a stable
  string instead, or the effect re-fetches in a loop.
- **No file over 500 lines.** Split by domain per the folder-structure rules
  above, not by arbitrary line count. One path is over and should come down the
  next time someone is in it: `components/site-audit/views/jobs/index.tsx` at
  517, which crossed the line when client-side paging was added. Do not treat it
  as permission for a second one.
- **Delete rather than keep.** No dead exports, no commented-out blocks, no
  re-export shims, no `_unused` parameters. `git` is the archive.
- Concision is about what the reader must hold in their head, not character
  count: prefer one clear pass over a dense one-liner chaining four operations.

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
