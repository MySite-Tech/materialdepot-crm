# lib/api — the Django/Kylas client layer

**Covers:** `lib/api/**` · `lib/server/**` · `lib/supabase.ts`

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
`API error: <status>`.

Tokens live in `localStorage` under `jwt_token` and `refresh_token`. `API_BASE_URL`
is **hardcoded** at line 1 — see `docs/backends.md`.

## Server-side helpers (route handlers only)

`lib/server/cache.ts` — in-memory TTL map, 5-minute default, with a lazy sweep
that runs at most once a minute. `lib/server/rate-limiter.ts` — a **module-global**
500 ms minimum gap between requests plus three retries on 429 with 2s/4s/6s
backoff.

Both are per-process. On Azure Static Web Apps that means per instance, so
neither is a shared cache or a global rate limit — two instances will happily
issue two requests inside the same 500 ms. Treat them as best-effort politeness
toward Kylas, not as guarantees.

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

## Constraints

- Add a new backend call to the module for its domain and let the barrel export
  it. A new top-level file under `lib/api/` needs a line in `index.ts` or callers
  will import from the leaf and bypass the pattern.
- Never call `fetch` against Django directly — you lose the envelope unwrap, the
  dedupe and the token refresh, all silently.
- The request budget and the four permitted egress paths are in `CLAUDE.md`.
