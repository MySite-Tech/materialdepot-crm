---
name: request-budget
description: >-
  How this CRM is allowed to talk to its backends. Use when adding, moving or
  reviewing any network call, data fetch, load effect, poller or bulk endpoint;
  when a page feels slow or issues too many requests; when handling a failed
  request in the UI; or when shipping a frontend change that depends on a new
  Django field or endpoint. Covers the ten-request budget, the four permitted
  egress wrappers, no-requests-in-loops, tab-scoped fetching, split load
  effects, visibility-gated polling, never presenting a failure as data, and
  the pre-merge verification checklist.
---

# Request budget and data-fetching rules

The short form of this lives in `CLAUDE.md`; this is the full rule set with the
incidents behind each rule.

**A page may issue at most ten requests on mount.** That is a budget, not an
aspiration — the B2B Dashboard was at ~181 and the Kylas proxy was answering
429s. Where the tabs stand now, counted by hand: B2B Dashboard 7 (8 on Last
Month / All Time), KAM 3, Client Database 2, Leads 2, Inbound 2, Outreach 1,
Category Revenue 8 (5 once the surrounding tab has already fetched the shared
lists). If a change pushes a page over ten, the change is wrong, not the budget.

Category Revenue is the worked example of the budget deciding a *feature*, not
just an implementation: per-category rows would have cost one request per
category (41), so the tab ships with rows per store and waits on a
`category_groups=` bulk parameter. See `docs/dashboard/context.md`.

**There are four ways out of this app and there must never be a fifth.**
`mdFetch` (Django), `kylasFetch` (Kylas), `sbGet`/`sbGetPaged`/`supabase.from`
(both Supabase projects), and a direct `fetch()` to this app's own
`app/api/*` route handlers. No axios, no XHR, no sockets. Route every new call
through the wrapper for its backend so the caching and auth-refresh below apply.

**That fourth way out is the one with no wrapper, so it carries two obligations
the other three handle for you.** A plain `fetch` to your own route sends no
credentials and gets no token refresh, and the route gets no session:

- **Send the bearer token and retry once on 401**, using `refreshSession()` from
  `lib/api/core/client.ts` so you share `mdFetch`'s single-flight refresh.
  Without it a tab left open past token expiry fails every call until reloaded.
- **Resolve who is calling inside the route**, with `requireCaller` from
  `lib/server/session.ts`, and re-run the same authorization helpers the UI uses
  instead of writing a second copy of the rules. A route handler that holds a
  privileged key (the Supabase service role, `KYLAS_API_KEY`,
  `MD_BACKEND_TOKEN`) and checks no token is open to anyone who can reach the
  app. `app/api/store-checklist/route.ts` is the worked example;
  `docs/api-layer/context.md` has the contract and the 30 s cache, and
  `docs/landmines.md` has what shipping without it looked like.

Neither is free: `requireCaller` costs one Django call per request, cached 30 s
per token. That is server-side, so it does not count against the ten — but it is
a reason to keep route-handler calls per interaction low, not just per mount.

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

A fifth is **wanted and does not exist yet**:
`/crm/leads/stats/?category_groups=`, the same `label:a,b|label2:c` shape as
`bm_groups=`. It is all that blocks per-category rows on Category Revenue.

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

**Never key an effect on a filter the query does not use.** No Site Audit query
filters by city server-side — `city=eq.` appears nowhere. Every list is fetched
whole and narrowed in memory by `inCity()`. So an effect with `[city]` in its
deps refetches data the browser already has each time the chip changes: Jobs
Overview repeated 3 calls, and `analytics/sections/execution.tsx` still repeats
**7 `sbGetLong` calls** (the 8s `sbGet` cache only covers rapid switching). Fetch
once with `[]`, tag each row with its `city`, and narrow in a `useMemo` on
`[rows, city]`.

The exception is real and worth checking for: `views/live/index.tsx` legitimately
keys on `[city]`, because it city-scopes the profile list first and then queries
orders **for those emails** — there the chip genuinely changes what must be
fetched. Confirm which case you have before removing a dep.

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
- **For a route handler, curl the rejections** — no token, a garbage token, an
  expired one, and a caller asking for someone else's scope. `tsc` and `build`
  pass a route that authorises nobody. Pointing `API_BASE_URL` at a small local
  stub that returns a roster row lets you exercise each role's limits without a
  real login.
- **Diff against `origin/main`, not your branch**, before claiming parity —
  `main` has run ahead twice, and a restructured file that `main` also edited
  merges as a delete/modify conflict that silently drops `main`'s fix.
