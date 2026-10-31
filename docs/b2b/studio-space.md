*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/views/studio-space/** · components/b2b/models/client/derived/studio.ts`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchStudioSignInUrl()` | `app/api/b2b/studio-handoff` → b2b-backend `POST /b2b/staff-handoff` | On open and on each Reload. One-time sign-in link for the caller's Django-verified phone |
| iframe | b2b-backend `GET /auth/handoff?code=` → `studio.materialdepot.com/console` | The default pane. Falls back to `/console` (Studio Space's own sign-in) when no link could be had |
| `fetchClients()` | b2b-backend `rows` (via `app/api/b2b/[...path]`) | Only when **Numbers by firm** is opened |
| `fetchStudioLogins()` | b2b-backend `studio-access` (relay) | Numbers by firm only. Every Studio Space login with its mobile and `visible_tabs`; shared 60 s cache |
| `addPhones()` (`useClientAggregates`) | Django `b2b-bulk` | Only when a firm is opened, for that firm's numbers |

## What the tab is (2026-10-30)

The Studio Space admin console itself, framed full-height in the tab
(`ui/console-frame.tsx`), signed in automatically by the CRM user's phone
(§One login below).
The per-number onboarding list below is the second pane, **Numbers by firm**,
mounted only when picked, so the default pane costs the CRM no request.

- **The user asked for the console, not a copy of it (2026-10-30).** A CRM-side
  list of Studio Space's firms with their KAM, read from a new b2b-backend
  route, was built and rejected the same day: "we want to open the Studio Space
  admin dashboard here itself". Don't rebuild Studio Space screens in the CRM.
  That backend branch (`b2b-studio-firms`) was never pushed.
- **Why framing works.** The app sends no `X-Frame-Options` or CSP. The
  `X-Frame-Options: SAMEORIGIN` that `curl -I` and headless Chrome see belongs
  to Cloudflare's bot-challenge page only. `crm.materialdepot.com` and
  `studio.` are same-site, and the session cookies are `SameSite=None; Secure`
  (b2b-backend `cookie_samesite`), so a sign-in inside the frame sticks. On
  2026-10-30 a fresh headed Chrome loaded the real sign-in page in the frame on
  the sandbox.
- **On localhost the frame is cross-site**, so a browser that blocks
  third-party cookies (Brave by default) drops Studio Space's cookies there and
  the frame stays on the sign-in page even after a good handoff. Only
  `crm.materialdepot.com` is same-site. Allow cross-site cookies for
  `studio.materialdepot.com` to test locally.
- **A KAM whose browser is being challenged by Cloudflare sees a blank or
  "refused to connect" frame.** The challenge page cannot be framed, and a
  cross-origin frame's failure cannot be detected from the CRM. So the bar says
  to open it in a new tab once, then press Reload, which remounts the frame.
- **Studio Space's own sidebar shows inside the frame**, beside the CRM's. A
  chrome-less embed mode with CRM subtabs per console page needs a
  `b2b-dashboard` change and is not built.
- **What a KAM sees is Studio Space's scoping, not the CRM's:** the console
  shows a KAM their market's firms plus the firms they are KAM of
  (`sees_partner` in b2b-backend `scope.py`).

## One login: the CRM signs the user in to Studio Space (2026-10-30)

No second sign-in. On open, `useStudioSignIn` POSTs to
`app/api/b2b/studio-handoff`, which takes the phone from `requireCaller` (the
Django-verified session), **never from the request body**, and asks b2b-backend
`POST /b2b/staff-handoff` for a code. The frame then opens
`<B2B_BACKEND_URL>/auth/handoff?code=`. The API spends the code, sets its usual
`.materialdepot.com` session cookies and redirects to `/console`.

- **The code is single-use and lives 60 s** (b2b-backend migration 0022,
  `staff_handoff`, only its SHA-256 stored, claimed with `UPDATE … RETURNING`).
  It sits in a URL, so a leaked one is dead after one use or a minute. That is
  why Reload asks for a new link instead of reloading the frame, and why the
  frame stays mounted (hidden) under Numbers by firm: remounting would replay a
  spent code.
- **Only active, unsuspended Studio Space staff match**, by `staff_user.phone`.
  A firm's own login never matches. A phone two staff share is refused (409),
  not guessed. A CRM user with no match gets the amber reason in the bar and
  Studio Space's ordinary sign-in page in the frame.
- **Staff need a phone on Studio Space** (console → Team). Whether production
  staff rows have one was not checked.
- **The CRM's Logout does not sign the user out of Studio Space**: separate
  sessions.
- Needs b2b-backend branch `studio-staff-handoff` (`4f72c2f`, off `master`,
  migration 0022) deployed. Until then the route answers "Automatic sign-in is
  not deployed on Studio Space yet" and the frame shows the sign-in page.
  Every backend path (no key, bad, unknown, shared, suspended and inactive
  phones, success, reuse, expiry, suspended after issue, a firm login's phone)
  was checked on a throwaway copy of the local Studio Space Postgres. The CRM
  side was checked on `npm run dev:sandbox` (stub: Kavya and Meera have Studio
  Space logins, the others do not).

## Numbers by firm

- **Tiles are lenses** (`ui/lens-tiles.tsx`). `studioLensMatches` gives both a
  tile's count and its list, and the per-KAM onboarding table uses the same
  `onboarded` predicate. Tiles count search plus KAM filter. The per-KAM table
  counts search only, so KAMs stay comparable while one is filtered.
- **The KPI.** KAM Studio Space Onboarding target is **25% of assigned firms**
  (`kpi-definitions.md`). It is counted here as a firm with at least one
  onboarded number ÷ firms with that KAM. A firm with no KAM is listed on its
  own line, never folded into someone's denominator.
- **No order aggregates on mount.** The list needs none. A firm's metrics load
  when its page opens. Until then the Firm page reads "…", never Inactive.

## Read from Studio Space, never written (2026-10-29)

The list is Studio Space's own data. `useStudioLogins()` reads b2b-backend's
`GET /b2b/studio-access` (every login with a mobile, and its `visible_tabs`) and
`firmStudioState` matches each firm's numbers against it. **Power** is
`visible_tabs IS NULL`, the whole dashboard. **Normal** is any restriction.
Nobody marks anything in the CRM, and the CRM cannot change access there. An
earlier cut of this tab used a per-contact marking the KAM made on the Firm
page. That field is gone (`client-db.md` §Each number).

- **Two requests when Numbers by firm opens**, `fetchClients()` and the studio read. Either failing
  shows the red notice and tiles read Unknown, never zero onboarded.
- Access granted on Studio Space shows here within a minute (the read's cache).
- Needs b2b-backend `b2b-studio-access`, which ships inside PR #14. Until
  that is deployed the tab reads Unknown.
