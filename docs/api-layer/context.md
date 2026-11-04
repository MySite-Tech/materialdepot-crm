# lib/api — the Django/Kylas client layer

**Covers:** `lib/api/**` · `lib/server/**`

## Purpose
Every Django and Kylas call in the app goes through here. `lib/api/index.ts` is
the barrel — it re-exports all 17 modules, so callers import from `@/lib/api`
and never from a leaf path. It used to be `lib/mock-api.ts`, which was a
misnomer: nothing in it is mocked.

Layout: `core/` (client, auth, kylas-client), `crm/` (leads, lead-details,
branches, users, roles), `b2b/` (inbound, client-properties, client-info-tasks),
`dashboards/` (the five dashboard feeds), `ops/` (escalation, kylas-sync,
store-visit).

## `mdFetch` — the five behaviours that matter

`lib/api/core/client.ts`. Everything below is invisible at the call site, which
is why it is written down.

**1. It unwraps the Django envelope.** A body shaped
`{ success: true, status, data }` is silently reduced to `data`. So a view that
returns the `md/core/api` envelope and one that returns a bare payload look
identical to callers. A `204` becomes `null`; an empty body becomes `null`.

**2. Identical GETs are deduped for 8 seconds** (`GET_TTL_MS`), keyed on
`path + JSON.stringify(headers)`. The cached value is the *promise*, so
concurrent callers share one in-flight request. A rejected promise is evicted
immediately, so a failure is not cached.

**3. Any non-GET clears that entire cache** — not just the affected key. So a
single PATCH invalidates every cached GET in the app. `saveToken` and
`clearToken` clear it too, which is what stops a login from serving the previous
user's reads.

**4. One refresh, not one per 401.** A 401 (or a 403 whose body looks like an
auth failure) triggers `refreshAccessToken` through a single module-level
`refreshPromise`, so ten concurrent 401s produce one `/token/refresh/` call and
all ten retry once. If the refresh fails, `forceReLogin()` clears both tokens,
removes `materialdepot_user` from localStorage and **reloads the page**.

That single-flight refresh is exported as `refreshSession()` for callers that do
not go through `mdFetch` — a plain `fetch` to one of this app's own `app/api/*`
routes gets no refresh otherwise, so a tab open past token expiry would fail
every write until reloaded. `lib/store-checklist/api.ts` is the caller to copy:
send the bearer token, and on a 401 `await refreshSession()` and retry **once**.

**5. A 403 that is *not* an auth failure is a different error.** It throws
"You do not have access to this resource." and never triggers a refresh —
distinguishing "your session expired" from "your role can't see this". The
sniffing is text-based (`isAuthFailureBody` looks for
`authentication credentials were not provided`, `token_not_valid`,
`token not valid`, `not authenticated`), so a backend that changes its auth
error wording will break the refresh path silently.

Error text for a non-OK response is taken in order:
`data` (when a string) → `detail` → `message` → `error` / `error.message` →
`API error: <status> on <path>`. The path has its query string removed, so no
phone number reaches the console. The bare `API error: 400` named no endpoint,
which left a dev-overlay error untraceable (2026-11-03).

Tokens live in `localStorage` under `jwt_token` and `refresh_token`. `API_BASE_URL`
is re-exported from `lib/api/core/config.ts`, which is the only place either
backend's base URL is written — see `docs/backends.md`. The browser's Kylas base
moves only with `NEXT_PUBLIC_KYLAS_API_BASE_URL`, which `docs/b2b/sandbox.md` sets.

## Server-side helpers (route handlers only)

`lib/server/cache.ts` — in-memory TTL map, 5-minute default, with a lazy sweep
that runs at most once a minute. `lib/server/rate-limiter.ts` — a **module-global**
500 ms minimum gap between requests plus three retries on 429 with 2s/4s/6s
backoff.

Both are per-process. On Azure Static Web Apps that means per instance, so
neither is a shared cache or a global rate limit — two instances will happily
issue two requests inside the same 500 ms. Treat them as best-effort politeness
toward Kylas, not as guarantees.

The B2B revenue report (`lib/server/b2b-revenue.ts` `revenueReport`) keeps a past
month for 30 minutes instead of 5, because the six-month trend rebuilds every
month it misses, at about five Django pages each. It also single-flights per
caller and month: the hero and the trend ask for the current month at the same
moment on open, and without that the month would be read from Django twice.
Refresh skips the cache, but not for a report built in the last minute.

### `requireCaller` — the only way a route handler learns who is calling

`lib/server/session.ts`. A route handler has no session of its own: auth in this
app is a Django JWT in `localStorage`, so anything under `app/api/*` is reachable
by whoever can reach the app unless it checks. `requireCaller(request)` is that
check, and `/api/store-checklist` is the route built on it.

It reads `Authorization: Bearer <jwt>`, takes `user_id` and `exp` out of the
payload, then calls Django `/user-organisation/` **with that same token** and
finds the row whose `user.id` matches the claim. That second step is what makes
it trustworthy: the payload is base64, not verified locally, so a forged token
gets past the decode and is then rejected by Django. It returns the caller's
`role`, `allowedBranches` and `individualPermissions` — everything the tab
permission gate runs on.

**A Django 5xx on that roster call is survivable (2026-11-02).** It is retried
twice (0.4s, then 1.2s). If it still fails, a token this server instance verified
in the last hour keeps its last known caller, because one failed roster call was
stopping every B2B save for that person. Only a 5xx or a network failure does
this: a 401 or 403 always rejects, so a revoked session never benefits. It lives in
memory, so a cold instance has nothing to fall back on and still answers 502.

Four things worth knowing before reusing it:

- **`/crm/user-profile/?phone=` cannot do this job.** It resolves whatever phone
  you pass, not the token's owner, so a caller could hand it somebody else's
  number. The roster is keyed by `user.id`, which is the one field the token
  actually asserts.
- **Role comes from `roleFromPermission`** in `lib/api/crm/roles.ts`, shared with
  `fetchUsers`. If the server derived the role differently from the browser, the
  UI would offer actions the route then refuses. `permission_name` is an HR
  label (see `docs/crm-shell/context.md`) — it is used here only because it is
  what `ROLE_TABS` and `BACKDATE_DAYS` are already keyed on.
- **The resolved caller is cached 30 s, keyed by user id + the token's tail.** So
  a revoked or logged-out session keeps working for at most 30 s on a route that
  is already open. Failures are never cached, and the key includes the token, so
  one user's entry can't serve another's request.
- **`user_id` is a UUID string, not a number.** Django's `User.id` is a
  `UUIDField`, so the claim and `user.id` on the roster row are both compared as
  strings. Coercing either with `Number()` yields `NaN` and 401s every caller.
- **It fails closed.** Unreachable backend → `SessionError` at 502, not "allow".
  Pair it with `sessionErrorResponse(err)` to turn that into the response.

### `relayB2B` — the route-handler bridge to the FastAPI b2b-backend

`lib/server/b2b-backend.ts`, used by `app/api/b2b/[...path]`. The B2B tab's data
lives in the FastAPI `b2b-backend` now, not Supabase (see `docs/backends.md`),
and the browser must not reach it directly — that would be a fifth egress path.
So `relayB2B` is the fourth-path proxy: it runs `requireCaller`, enforces
`canUseB2B` (the tab's own rule — role set or the `crm.b2b_sales` slug; the
original `admin`/`b2b_sales` set would 403 every `b2b_KAM` and `b2b_manager`),
then forwards to `${B2B_BACKEND_URL}/b2b/<path>` with a
server-only `x-sync-key: B2B_BACKEND_SECRET`. Routes with their own shaping
(`app/api/b2b/waitlist`, `ec-visits`) call `b2bBackendFetch` with the
same credential instead. Four things the relay deliberately does:

- **Refuses two things to anyone but a manager or admin (2026-10-31).**
  `managersOnly` covers `studio-number` and a client-row `DELETE`, so hiding the
  buttons is not the only check. Adding a client row is not on the list, because
  Outreach's handover creates firms through the same call
  (`docs/b2b/client-db.md` §Who can add, merge and delete).
- **Allow-lists the first path segment** (`rows`, `kam-load`, `target`,
  `studio-access`, `studio-number`) so the catch-all is a defined surface, not an open proxy to
  the backend. `studio-access` (2026-10-29) is GET-only and read-only: every
  Studio Space login's mobile and tab restriction, for the Firm page badge
  (`docs/b2b/client-db.md`). Other `/b2b` routes such as `team` and `ec-visits`
  have their own handlers rather than being allow-listed here.
- **`studio-handoff` is a handler of its own, never allow-listed** (2026-10-30).
  It mints a Studio Space session, so the phone must come from `requireCaller`
  and nothing the browser sends. `studioHandoffUrl` builds the link on
  `B2B_BACKEND_URL`, which must therefore be the public API host whose cookies
  Studio Space reads (`docs/b2b/studio-space.md` §One login).
- **503s when either env var is unset**, rather than defaulting to a reachable
  base — the same fail-closed rule the service-role routes follow.
- **Never answers with the backend's raw body on failure**: a non-2xx becomes a
  `{ error }` at 502, so a dropped upstream call can't read as data. The CRM
  client (`lib/b2b/data/backend.ts`) sends the bearer token and retries once on
  401 via `refreshSession()`, exactly as the store-checklist caller does.
- The backend's errors arrive as `{ error }` (its global handler) or FastAPI's
  `{ detail }`; both are read.

`b2bBackendFetch` in the same file is the **server-only** sibling, for route
handlers that talk to the backend themselves rather than relaying the browser:
`lib/server/b2b-team/store.ts` (team roster, round-robin claims) uses it. It
throws `B2BBackendError` with the upstream status, because the callers branch
on it. A 409 on a round-robin claim means "already claimed", and a 404 means
the backend predates migration 0020, which the store turns into
`TeamTableMissing`. Those paths are deliberately **not** in the relay's allow
list: the browser has no business writing assignment rows.

`POST /api/b2b/team` with `{from, to}` (manager-only) is Change number. It goes
to `/b2b/team/renumber` through the same store. A 404 whose detail is FastAPI's
own "Not Found" means the backend predates that route, and the user is told so.
A 404 with a detail of its own ("Nobody on the team has that number") is shown
as is. It must not fall into `TeamTableMissing` like the other 404s.

The store sends `is_admin` only when the caller passed one. The backend's PUT
leaves the column untouched when the key is absent, so a save from an older
client, or one that only flips round robin, cannot clear someone's B2B admin
flag. A backend on 0020 ignores the key, and its GET has no `is_admin`, which
reads as false.

**A server route reads the backend through `/b2b/*`, never `/sync/*`.** Cloudflare
answered `/sync/*` 403 from a script with the right key on 2026-10-31 and let `/b2b/*`
through. `lib/server/b2b-revenue.ts` pages Django's `/crm/leads/`
server-side because a month is 5+ requests, which a page may not spend on mount. It
caches 5 minutes per caller, because Django scopes rows to the caller's token, and a
Studio, redirect or team failure sets a flag rather than reading as zero
(`docs/b2b/overview.md` §Four revenue channels).

The report, the trend and the funnel share `readHolders`, so an order cannot land in
one channel in one place and another elsewhere. Each call rebuilds the whole number
book from `/rows`, so keep it cached rather than calling it per row. A read stops at
`MAX_PAGES` and returns `truncated`, which the screen must show. (The Orders-tile
ledger route that also read through it was deleted on 2026-11-03 with its panel.)

It also serves `app/api/b2b/revenue/funnel` (2026-11-03, work in progress), the
Client Database funnel (`docs/b2b/overview.md` §Client Database funnel). That route
pages up to `FUNNEL_PAGES` (30) of `/crm/leads/`, 8 in flight at a time
(`PARALLEL_PAGES`). Before this, every page was requested at once, and 30 at once
would hit Django together.

### There is no scheduled route in this app, and no platform cron to run one

Worth knowing before someone adds one: this app deploys to **Azure Static Web
Apps**, which has no cron. `vercel.json` in the repo root is a leftover that
Azure never reads, so a `crons` block added there is silently dead — the kind of
change that looks shipped and never runs. A schedule has to come from outside:
a `schedule:` GitHub Actions workflow that curls the route, or an Azure Logic App
on a Recurrence trigger.

Either way the route itself has no caller to resolve, so `requireCaller` cannot
help it. It would have to authorise on a shared secret in the `Authorization`
header and **refuse when that secret is unset**, rather than defaulting to open —
doubly so for anything holding the service-role key.

**`/api/b2b/ec-referral` (2026-10-31) is a B2B route that non-B2B users may call.**
It holds `B2B_BACKEND_SECRET` and answers store staff, so it does not use
`relayB2B`, whose `canUseB2B` gate would refuse them and whose passthrough would
hand them every row. Any session may call it, and it writes only a lead it built from
whitelisted fields. `reassign-many` on `/api/b2b/inbound/assign` is capped at
`INBOUND_ROTATION_BATCH` because each lead is a Kylas read and write, and it
reports `moved` and `failed` separately rather than failing the whole batch.
See `docs/b2b/ec-referral.md` and `docs/b2b/leads.md`.

This is why the B2B inbound round robin (`/api/b2b/inbound/assign`, 2026-10-28)
runs **while someone has Inbound Leads open**: on open, then every 5 minutes
when the tab is visible. There is no server timer, so a lead that arrives
overnight is assigned by the first rep to open the tab. It is idempotent, so
being triggered from many browsers is safe. See `docs/b2b/inbound.md` §Who owns
a lead.

### `lib/server/b2b-team` talks to Kylas without `kylasFetch`

Added 2026-10-28 for the B2B team routes. `kylasFetch` lives in a browser
module that carries the Kylas key as a literal. This server-only module reads
`process.env.KYLAS_API_KEY` and has its own small `fetch` wrapper instead, so
the route works only where the env var is set. **Check the Azure application
settings before deploying it**, along with `SUPABASE_SERVICE_ROLE_KEY`, which
its Supabase half needs.

Two things it does that `kylasFetch` callers do not:

- **It only reads (2026-11-03).** The owner PATCH (`setLeadOwner`) and its read
  back are gone: inbound ownership lives on the CRM row (`docs/b2b/inbound.md`
  §The CRM owns a lead once it is imported). `kylas()` is exported for the import
  in `lib/server/b2b-inbound/`, which searches and never writes.
- **Kylas errors throw.** They are not swallowed into an empty list (the
  `total: 0` trap in the request-budget skill). The route turns them into a
  502 naming Kylas.
- **It retries 429 and 503 on its own (2026-10-31).** It waits 1s, 2s, 4s, then
  8s, or `Retry-After` capped at 8s, then throws `KylasBusy`. Kylas's headers
  read `x-ratelimit-replenish-rate: 5` and `x-ratelimit-burst-capacity: 10`, but
  the budget is shared with whatever else uses the key. Sampled about once a
  second on 2026-10-31 from a machine with no other Kylas traffic, it cycled
  about 7s clear, 7s of only 429. People do not click on a timer, so something
  automated outside this repo is spending it. Lead edits showed Kylas's
  "Universal API Key" as the top non-workflow writer, but that is this same key,
  so it cannot name the caller. `docs/backends.md` §Owed by Django row 12 has the
  ask. The 15s total exists to outlast the cycle. `kylasFetch` now retries five
  times (15.5s) for the same reason.
- **Reassign never reaches Kylas (2026-11-03).** It reads the CRM row, writes
  the new owner onto it and logs the assignment, for `crm-…` and Kylas ids alike.

## `/crm/leads/stats/` — the date and branch a figure is counted by

`fetchCRMLeadsStats` and `fetchCRMLeadsStatsByBmGroup` (`lib/api/crm/leads.ts`)
take **two** date windows that mean different things, and picking the wrong one
is silent:

| Param | Django filters on | Matches |
|---|---|---|
| `created_from`/`created_to` | `Ticket.created_at` | every deal, cart-stage included |
| `order_from`/`order_to` | `estimate.order_placed_time` | only deals that reached an order |

`branch_basis` decides what `branch` means: unset (or `owner`) keys on the cart
**owner's** branch, `estimate` on the branch the order was **booked** at. These
are genuinely different populations — see `docs/b2b/data-layer.md` for the month
where they differed by ₹33L — so `order_from`/`order_to` is only meaningful with
`branch_basis=estimate`, and a cart with no estimate matches neither.

The response **echoes back the basis it actually applied** (`basis: 'created' |
'order'`), because a deployment that predates `order_from` ignores the param and
answers with cart-created figures that are indistinguishable from the real
thing. The Overview's stats reads (deleted 2026-11-03) turned the mismatch into
`basisApplied: false` and an amber notice rather than the wrong number under the
right label. **Anything added here that Django might not understand needs the
same echo** — a silently ignored query param is the frontend half of "never
present a failed request as data".

Because the 8s GET dedupe keys on the full path, the two bases are separate
cache entries and never collide.

`valueExclGst` on each bucket (and `cartValueExclGst` on `/crm/leads/` rows) is
**optional in the types on purpose**: Django adds it only to the plain stats and
list calls, never to `bm_groups=` stats, and an older deployment omits it. Absent
means unknown: a caller may show the GST-inclusive `value` instead only if it
labels it "incl. GST", never under an ex-GST label. See
`docs/crm-shell/context.md` for how it is computed and displayed.

Each `/crm/leads/` row also carries (all optional, additive — an older Django
omits them): **`clientGst`** (the enquiry's `estimate.client_gst`),
`orderPlacedAt` (`estimate.order_placed_time`) and `bookedBranch` (where the
order was booked, vs `branch` = the cart owner's). Two new query params match
the same exact, uppercased GSTIN (never `icontains`): **`gst=`** filters the
list and stats to enquiries billed to those GSTINs, and **`include=boq`** adds a
`boqItems` array per row — the PI's BOQ lines (`name`, `qty`, `unit`, `rate`,
`total`) — which is heavy and off by default, requested only by the Firm page's
per-phone fetch. `CRMLeadsQuery` (`fetchCRMLeads`) now carries `gst` and
`include`; `fetchLeadsByPhone` sends `include=boq`, and the Firm page's
`fetchOrdersByGst` (`lib/b2b/orders/details.ts`) sends `gst=` to fold in
enquiries billed to a firm's GSTIN on a number not listed on it.

## `fetchLead` selects on `ticketId`, not on the lead id

`lib/api/crm/lead-details.ts` re-reads a single row after a save. It cannot match
on `id`: Django builds that from the cart number (or the estimate's ENQ id), so a
client with several deal tickets on one cart returns the **same** `id` on every
row and `find` takes whichever came back first — the caller then merges another
lead's remarks into the one it just saved. `ticketId` is the deal ticket's own
pk and the only per-row identity, so it is passed through and matched on; `id`
stays the argument the endpoints actually take. The `q=<phone>` page size is 50
rather than 5 for the same reason — a sibling outside the page is unfindable,
and a miss now throws so the caller falls back to a blind `upsertLead` instead of
writing to the wrong row.

## Branch detail is read on Edit, and saved as a diff

`lib/api/crm/branches.ts` lists branches from `/orgainsation-branch/`, but that
list serializer is shared with the PO/PDF flows and carries no `city` or
`map_link`, so Admin > Branches reads the four editable fields (`branch_name`,
`city`, `address`, `map_link`) from `GET /orgainsation-branch/<id>/` only when
Edit is clicked — one request per click, nothing on mount. The rest of the
model (numbering prefixes and counters, bank details, logos) is the same for
every store and is deliberately not editable here: changing a counter re-numbers
POs. `saveBranchDetail` `PUT`s only the fields that changed (the backend
update is `partial=True`), so a save never rewrites what the form did not show.
`map_link` is a Django `URLField`, so the form rejects anything that is not a
full `http(s)` URL before sending — otherwise the 400 surfaces as the bare
"API error: 400". `city` needs the backend `OrganisationBranch.city` field;
against an older API it is silently dropped, not an error.

## Constraints

- Add a new backend call to the module for its domain and let the barrel export
  it. A new top-level file under `lib/api/` needs a line in `index.ts` or callers
  will import from the leaf and bypass the pattern.
- Never call `fetch` against Django directly — you lose the envelope unwrap, the
  dedupe and the token refresh, all silently.
- The request budget and the four permitted egress paths are in `CLAUDE.md`.
