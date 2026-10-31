# materialdepot-crm

Next.js 16 (App Router, Turbopack) + Tailwind CRM portal for Material Depot.
`app/page.tsx` is a `<Suspense>` wrapper around `components/crm`, whose
`index.tsx` renders every tab.

`README.md` is a leftover Vite template and describes nothing about this repo —
ignore it.

```bash
npm run dev        # next dev -p 3001. The port is not a preference: api-dev2's
                   #  CORS allowlist has localhost:3000, :3001 and :5173 and
                   #  nothing else, so on any other port (127.0.0.1:3000
                   #  included) every Django call dies as "Failed to fetch" with
                   #  no status — which reads like a code bug and is not one.
                   #  :3000 is usually another repo's server (ss-local-all,
                   #  b2b-client-dashboard); `ps aux | grep "next dev"` prints
                   #  whose. Driving someone else's server in a browser and
                   #  reporting what you saw is the failure mode. A free port
                   #  other than these three only works against the stub below.
npm run build      # next build
npx tsc --noEmit   # typecheck — fast, run this before claiming a change compiles
```

`npx eslint <file>` reports "File ignored because no matching configuration"
for `app/` and `components/`, and `npm run lint` is dead too — it still runs
`next lint`, which Next 16 removed ("Invalid project directory provided, no such
directory: .../lint"). There is currently **no working lint command**; `npx tsc
--noEmit` is the only automated check.

### Running a pure module against real data

There is no test runner either, so a module whose logic matters gets exercised
by hand. `node --experimental-strip-types` does **not** work on this repo's
sources — relative imports here carry no file extension and Node's ESM resolver
refuses them. Compile first, resolve the relative imports, then run:

```bash
T=$(mktemp -d)
npx tsc <entry>.ts --ignoreConfig --outDir "$T" \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck
node -e '
const fs=require("fs"), path=require("path"), T=process.argv[1];
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for (const f of walk(T).filter(f=>f.endsWith(".js"))) {
  const here=(s)=>fs.existsSync(path.resolve(path.dirname(f),s));
  fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/(from\s*["\x27])(\.[^"\x27]*)(["\x27])/g,
    (m,q,p,q2)=>q+(here(p+".js")?p+".js":here(path.join(p,"index.js"))?p.replace(/\/$/,"")+"/index.js":p)+q2));
}' "$T"
node -e "import('$T/<entry>.js').then(m => …)"   # or a small .mjs harness
```

`--ignoreConfig` is required: naming files on the command line makes tsc refuse
to load `tsconfig.json` (TS5112). This only suits modules with no React and no
network — which is what `models/` and `lib/b2b/` mostly are. It is how
`models/client/parents/` was checked against a real 941-row export before
shipping, and it caught nothing `tsc` would ever have caught, because `tsc` has
no opinion about whether the grouping is correct.

Two things about that middle step, which used to be a one-line `sed` appending
`.js` to every relative import and could not run this repo's own modules:

- **A relative import here is as often a directory as a file.** `from '../shared'`
  and `from '.'` need `/index.js`, not `.js`, and Node fails them differently
  (`ERR_MODULE_NOT_FOUND` for the first, `ERR_UNSUPPORTED_DIR_IMPORT` for the
  second) — neither of which names the import that caused it. The rewriter above
  asks the filesystem which one each import is instead of guessing, so it handles
  a barrel, a directory self-import and a plain file in one pass.
- **tsc will report errors and emit anyway.** Anything importing the `@/` alias
  raises TS2307 because `--ignoreConfig` dropped `paths` — the JS is still
  written, so don't stop at the error. Piping the compile through `|| true` is
  fine; reading the error and concluding the recipe is broken is not.

Verified on `components/site-audit/install-ops/utils.ts` (imports `../shared`,
which imports `.`) on 2026-09-15.

### Looking at a screen, which needs a stubbed Django

Real sign-in works on `npm run dev` (:3001): login is phone + OTP against
`api-dev2.materialdepot.in`, and the OTP goes to a real phone — so a person can
sign in, a session cannot. For an unattended look, `npm run dev:stub`
(`scripts/django-stub.mjs`) starts a Django stub on `:4000` answering
`/login-otp/`, `/verify-otp/`, `/crm/user-profile/` and `/user-organisation/`,
then the app on `:3100` pointed at it. Any phone and any four-digit code get in
as `admin` (`STUB_ROLE=b2b_KAM` etc. to change it, `STUB_PERMISSIONS=` for a
comma list of slugs), and **only Django is stubbed** — Supabase stays real.
`node scripts/django-stub.mjs --stub-only` starts just the stub, for the clone
below.

**A second `next dev` in this directory exits** with "Another next dev server
is already running", and `:3001` usually already has the user's own server. That
server uses real Django, so don't stop it. Run the stubbed one from an APFS
copy-on-write clone in your scratchpad instead. It takes seconds and almost no
disk space:

```bash
C=<scratchpad>/clone; mkdir -p "$C"
for e in $(ls -A | grep -vE '^(\.next|\.git)$'); do cp -cR "$e" "$C/"; done
cd "$C" && npm run dev:stub
```

The clone is a snapshot, so `cp` each file you edit afterwards into it. Kill
both `:3100` and `:4000` when you are done. Verified 2026-10-28.

When another session already holds :3100/:4000, run a second sandbox from your
own clone on other ports: `STUB_PORT=4100 APP_PORT=3200 node
scripts/sandbox/index.mjs --reset`. If a sandbox's stub process is killed, the
next `next dev` on that same clone can answer 404 for `/`. Delete the clone's
`.next` and start it again. Both seen 2026-10-30.

Four things the stub must get right, each of which has cost a debugging round:

- **The envelope is `{ success: true, status, data }`** and `unwrapEnvelope`
  checks all three keys. A bare `{ data }` unwraps to nothing, and the app then
  renders a user with no role — no error anywhere.
- **`verifyOtp` does NOT go through `mdFetch`.** It reads `token` and `refresh`
  off the raw body, so that one response is unwrapped and differently named.
  The token must be a real three-segment JWT: `userIdFromToken()` base64-decodes
  the middle segment and wants `user_id` and an unexpired `exp`.
- **Never answer 401**, or `forceReLogin()` wipes the session mid-load. Answer
  `200 []` for everything unrecognised.
- **The tab gate's role comes from `/crm/user-profile/?phone=`, not from the
  roster.** `loginWithPhone()` reads `role`, `allowedBranches` and
  `individualPermissions` straight off that response;
  `/user-organisation/` is what the **server-side** `requireCaller` reads, for
  `app/api/*`. Stub only the roster and you log in successfully with the five
  default tabs and no B2B Sales, which looks like a permissions bug in the app
  and is a hole in the stub. Both need filling, and they need to agree.

So a local CRM shows **real Supabase data and empty Django data** — say which
half was stubbed when reporting anything from it.

**Both modes at once, on the latest backend: `~/Projects/ss-local-stack/crm-local.sh
up|down|status|reclone`** (its `README.md`, set up 2026-10-30). Real data on
:3001 reads a GET-only copy of production B2B rows in local `crm_real` (backend
:8802, refreshed by `refresh-crm-real.py`), with real Django and Kylas behind
`crm-guard.mjs` on :8803, which refuses their writes. Dummy data on :3100 runs
from the snapshot `~/Projects/crm-dummy` (`reclone` refreshes and reseeds it)
against `crm_dummy` (:8801). Opening Inbound runs round robin with no click, so
`in_rotation` stays false in `crm_real`. A 403 "Blocked" there is the guard.
**Supabase is not guarded:** saves on its tabs are production writes.

**For B2B, use `npm run dev:sandbox` instead** (`docs/b2b/sandbox.md`). It runs
the same Django stub plus a stubbed FastAPI b2b-backend and Kylas, seeded with
dummy leads across the whole Inbound → Outreach → KAM journey, on the same
:4000 / :3100 ports and from the same APFS clone. Five personas log in by phone
(`9000000001` inbound … `9000000099` manager). B2B saves land in
`.sandbox/state.json` in the clone, so **saving is safe there**, and only there.
`--reset` reseeds relative to now. Supabase is still real in it.

**Driving it with a browser.** Playwright is not a dependency here and should
not become one; install it in a scratch directory with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright` and launch the system
Chrome, `chromium.launch({ channel: 'chrome' })`. Listen on
`page.on('pageerror')` and `page.on('console')` while you do it. Assert on
geometry (`getBoundingClientRect`) and computed style as well as on text — a
status chip can be present, correct and still be making a false claim, which is
how "On partner dashboards now" was caught sitting beside "Not pushed".
Locate by exact text: `locator(sel, { hasText: 'Inactive' })` is a
**case-insensitive substring** match. On 2026-10-28 it clicked the "Lapsing
soon" tile, whose subtitle reads "go inactive in 30 days", and the test reported
an app bug that did not exist. Use `hasText: /^Inactive$/` on the title element.

**Supabase is real in that browser, so never exercise a SAVE path to see a
feature work.** There is no staging Supabase — clicking through an editor writes
production rows, and "it was only test data" is not recoverable. This includes
all of B2B. **Since PR #27 (2026-10-29) B2B data lives in the FastAPI
`b2b-backend`** (`lib/b2b/data/backend.ts` → `app/api/b2b/[...path]`, see
`docs/backends.md`), which is production too, on `main` and on the revamp branch
(merged the same evening). Never click Save to test. The exception is **`npm run
dev:sandbox`** (`docs/b2b/sandbox.md`), which stubs the B2B backend, Kylas and
Django with dummy data, so B2B saves land in a local file.
To see a screen
in a state the data is not in, intercept the READ instead:
`ctx.route(/app_settings/, r => r.request().method() === 'GET' ? r.fulfill({…}) : r.continue())`
renders the page against whatever state you need and writes nothing. That is how
the category-revenue `% of Target` column was checked on 2026-09-23 without ever
saving a target. Say which reads were stubbed when reporting what you saw, the
same as for the Django stub above.

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
| B2B sales CRM | `docs/b2b/` | Split into `overview` (the landing sub-tab, ex-Dashboard, rebuilt 2026-10-30) · `inbound` · `outreach` · `leads` · `client-db` · `kam` (admin assignment with KAM sign-off; per-PI follow-ups; the meeting check-in, built 2026-10-30) · `ec-directed` (leads sent to an EC, and the assisted revenue they bring) · `ec-referral` (the store form that hands a walk-in B2B client to Outreach) · `data-layer` · `studio-space` (the tab that replaced Partner Content: a link out, plus per-number Studio Space onboarding) · `partner-bridge` (design only) · `sandbox` (`npm run dev:sandbox`, the whole journey on dummy data); `context.md` is the pointer table. **A manager/individual visibility redesign is active across sessions — read `sales-tab-redesign.md` and `kpi-definitions.md` first** before any B2B Sales tab change. A summary tile on a B2B tab is a clickable *lens*: one predicate gives both its count and the list it opens (`inbound.md` §One tab, three tile groups; KAM has the same, `kam.md` §The tiles are the navigation) |
| App shell / auth / tabs | `docs/crm-shell/context.md` | Login, session restore, the 16-tab permission gate |
| Remarks quality | `docs/remarks-quality/context.md` | The 4-pointer remark score, why scoring lives in Django, the 7 MB in-memory payload, server-enforced `crm.remarks_quality` |
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
| Shipped-and-fixed bugs | `docs/landmines.md` | 70 bugs already fixed here, kept because the shape recurs. **Not only site-audit** — it also holds the `42703` missing-column signature, the roster's probe-gated columns, the permissions drift, the lost-photo state-updater bug, duplicate log writes, and why an empty `allowedBranches` means all branches |
| The three backends | `docs/backends.md` | Django vs CRM Supabase vs Site Audit Supabase, and the hardcoded creds; B2B on the FastAPI backend since 2026-10-29; **§Owed by Django**, the one list of every change still waiting on Django |
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
**Contents** list of all 70 titles, so grep a title and read around the line you
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

**B2B Sales work is on `b2b-revamp-2026-10-28`**, not `Installation-Changes`.
Its **PR #29 shipped on 2026-10-29** with b2b-backend #13 (migrations 0020 and
0021). **PR #32 shipped on 2026-10-31** with b2b-backend #15 then #16 (#14 went in
inside #16; migrations 0022 and 0023): Studio Space framing and read-only access,
per-person Targets, Overview, the check-in, multi-team people, EC Directed, the
assign bar, firm SPoCs and the EC B2B Referral tab. Sales, retail, manager and admin
get that tab by role; any other role with a permission list needs
`crm.ec_b2b_referral` ticked under Admin > Users.
**A merge to b2b-backend `master` runs its migrations by itself.** Seen on
2026-10-31: 0022 was live about four minutes after #15 merged. To test that without
writing, open `/auth/handoff?code=x` in real Chrome, because Cloudflare challenges
`/auth/*` from curl and lets `/b2b/*` through. A redirect to `/login` means the
table exists. Check `git log origin/main..HEAD` before claiming anything is live.
**The tech team merges, not a session**, unless Dhruv asks.
`npm run dev` on :3001 serves the working tree, so whatever is committed or
uncommitted here shows there without a restart. While `npm run dev:sandbox` is
running from this directory (:3100), a second `next dev` here exits. To host
real data on :3001 at the same time, run `npx next dev -p 3001` from an APFS
clone (the recipe in §Looking at a screen). The clone is a snapshot, so
re-clone it after pulling.
`docs/b2b/revamp-2026-10-28.md` lists the commits and the deploy
prerequisites. The local `b2b-revamp-28oct` is an older, never-pushed ancestor
of it. Don't build on that branch.

**Studio Space is `MySite-Tech/b2b-dashboard` on `MySite-Tech/b2b-backend`**,
the same FastAPI backend as B2B here, served at `studio.materialdepot.com`.
Push both with `dhruv-md`. Only `main`/`staging` (dashboard) and `master`
(backend) deploy. `dhruv-md/Studio-Sales` and `daaku-daddy/B2B-Client-Dashboard`
(Vercel, Supabase) are older ancestors. A session that analysed them as Studio
Space on 2026-10-29 got the backend, hosting and waitlist all wrong. Its local
dev stack is `~/Projects/ss-local-stack` (`status.sh`, dashboard on
`127.0.0.1:3700`, backend :8700, Postgres :54700).
**The CRM shows Studio Space by framing its console, not by copying it**
(`docs/b2b/studio-space.md`). Dhruv rejected a CRM-side rebuild of its firm list
on 2026-10-30. Test a backend migration on a `CREATE DATABASE … TEMPLATE newdb`
copy of that Postgres, never on `newdb` itself: the stack's `start.sh` migrates
from `dhruv-changes` and fails on a revision it does not know.

**Branching while other sessions edit this tree: use a `git worktree`.**
Switching branches here drags every session's uncommitted files along.
`git worktree add -b <branch> <scratchpad>/<dir> origin/main` leaves the shared
tree alone. A fresh worktree has no `node_modules` and no generated
`.next/types`, so `npx tsc` prints `RouteContext` errors from `app/api/*` that
are not yours. Symlink `node_modules` in for `tsc` and filter `RouteContext`
out of its output. `next dev` rejects a symlinked `node_modules` ("points out of the
filesystem root"), so `cp -cR` it instead to run a server. Either way, keep it
out of the commit.

**b2b-backend is a sibling repo** (`~/Projects/b2b-backend`,
`MySite-Tech/b2b-backend`, production is `origin/master`). Its checkout has
`dhruv-changes` on it, which was dropped on purpose: never commit there. Make a
worktree off `origin/master`, push with `dhruv-md`. A local FastAPI and
Postgres do exist: `~/Projects/ss-local-stack` (see Studio Space below). Its
database lags `master`'s migrations, so a `/b2b` route over the 0018+ tables
500s there. Run a second uvicorn from your worktree on another port with
`common.sh` sourced and your own `SYNC_SHARED_SECRET`, not the stack's :8700.
Say the CRM reads Unknown until the route deploys. Studio Space's own data
(`partner_user.visible_tabs`, where `NULL` is the whole dashboard) lives there
too.

**The sandbox's backend stub is at `:4000/b2b-backend/b2b/<route>`** with header
`x-sync-key: sandbox`. Without the `/b2b-backend` prefix it answers `200 []`,
which reads like an empty route. It loads routes once at start, so restart it
after editing `scripts/sandbox/routes/*`.

**`bash .claude/hooks/docs-guard.sh` hangs when run by hand** because it `cat`s
stdin. Run it as `bash .claude/hooks/docs-guard.sh </dev/null`. macOS has no
`timeout`.

**`origin` is a PUBLIC repository** (verified 2026-09-14 via `gh repo view`), as
are `daaku-daddy/material-depot-site` and `daaku-daddy/B2B-Client-Dashboard`.
Everything committed here is world-readable: no customer names, phone numbers,
order values, GSTINs or tokens in code, fixtures, test data, commit messages or
docs. This is also why `components/site-audit/shared/sb-client.ts` hardcoding the
field-ops Supabase anon key is a deliberate, already-public exposure rather than
a leak (that project runs with RLS off and its apps have no auth) — but it means
"it's only the anon key" is not a privacy argument for adding more.

**`main` is the deployed branch, and it can be AHEAD of `Installation-Changes`.**
Pulling the feature branch is not enough: the teammate merges to `main` and
keeps pushing there, so `git log HEAD..origin/main` is the check that matters
before touching a shared file. On 2026-09-03 `origin/Installation-Changes` was
up to date while `main` was 5 commits ahead carrying a 498-line rewrite of
`components/site-audit/staff/users/index.tsx` — building on the branch as-is would have re-reverted
it, which is precisely the drift this file records happening twice already.
Merge `origin/main` in first; the conflicts are usually just import lines.

**Several Claude sessions work in this one working tree at the same time.** On
2026-10-28 three sessions were editing B2B at once: Inbound, the KAM Firm page
and Outreach. `ListAgents` showed 12 peer sessions, two of them busy. Uncommitted
changes you did not make belong to a live session. Before editing a module:

- Run `git status --short -- <module paths>` and look at the modified times. A
  file changed in the last few minutes that you did not touch means someone is
  mid-edit. Do not edit, revert or "fix" it. Wait for their commit, or ask the
  user.
- **Stage by explicit path, never `git add -A` / `git commit -a`.** A broad add
  sweeps another session's half-finished work into your commit. Their
  half-finished work can also fail the build, which is not yours to repair. On
  2026-10-28 the shared dev server answered 500 ("Export `Metric` doesn't
  exist") and `tsc` failed in `client-db/` and `kams/`, all from the KAM
  session's in-progress refactor.
- The dev server is shared too, so another session's broken import can take
  every page down. Check whose error it is (the file path in the overlay or in
  `tsc`) before debugging. Wait it out with a background `until curl …` loop.
- Once the other session commits, re-read your diff of any file you both
  touched before committing. `CLAUDE.md` and `docs/**` are the usual overlap.

**Check which account can push before committing for `origin`.** Three are
logged in to `gh` here (`daaku-daddy`, `dhruv-md`, `dhr3vv`), and which one
holds write access has changed twice. A push from the wrong one fails with
`403 … Permission to MySite-Tech/materialdepot-crm.git denied to <account>`,
after the commit has already been made. Check each account with
`gh api repos/MySite-Tech/materialdepot-crm --jq .permissions`.

**From 2026-10-28 (evening), push with `dhruv-md`.** It was given `write` access
by invitation, and the invitation had to be **accepted** before
`.permissions.push` read `true`. Until then the API reported `false` and the
pending invite only showed under `gh api user/repository_invitations`.
`daaku-daddy` and `dhr3vv` are `pull` only, and so is everyone on `upstream`.
Git uses `gh auth git-credential`, so the *active* `gh` account is the one that
pushes. Run `gh auth switch --user dhruv-md` first. Don't try `upstream`.

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

- **Assignment has one shape in B2B (2026-10-31).** `ui/assign-bar.tsx`: team
  first, then One person or Round robin over a chosen set. Bulk takes only records
  with no owner; an owned record moves only as the single selected row. Do not add
  a second assign control. A team stays greyed out where no data path exists.

- **The B2B Sales tab has no data export anywhere (2026-10-29).** The user
  removed it from Client Database, Leads and Inbound for every role, admins
  included, as a security decision; KAM and Outreach lost theirs earlier the same
  day. `ExportButton` is deleted. Do not add an export back behind a role check.
