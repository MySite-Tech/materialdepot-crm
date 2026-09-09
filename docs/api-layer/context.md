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

## Constraints

- Add a new backend call to the module for its domain and let the barrel export
  it. A new top-level file under `lib/api/` needs a line in `index.ts` or callers
  will import from the leaf and bypass the pattern.
- Never call `fetch` against Django directly — you lose the envelope unwrap, the
  dedupe and the token refresh, all silently.
- The request budget and the four permitted egress paths are in `CLAUDE.md`.
