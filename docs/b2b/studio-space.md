*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/views/studio-space/** · components/b2b/models/client/derived/studio.ts`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchStudioSignInUrl()` | `app/api/b2b/studio-handoff` → b2b-backend `POST /b2b/staff-handoff` | On open and on each Reload. One-time sign-in link for the caller's Django-verified phone |
| iframe | b2b-backend `GET /auth/handoff?code=` → `studio.materialdepot.com/console` | The default pane. Falls back to `/console` (Studio Space's own sign-in) when no link could be had |
| `fetchClients()` | b2b-backend `rows` (via `app/api/b2b/[...path]`) | Only when **Numbers by firm** is opened |
| `fetchStudioAccess()` | b2b-backend `studio-access` (relay) | Numbers by firm and the Client Database column. Every number a real studio holds with its access, plus `firms` (each studio's numbers, GSTINs, login count, whether any login is Power); shared 60 s cache |
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
- **What a person sees is Studio Space's scoping, not the CRM's.** Until
  b2b-backend PR #17 merges, the console shows a KAM their market's firms plus
  the firms they are KAM of. After it, only an admin sees every firm, and KAM,
  outreach and inbound see only firms assigned to them (`sees_partner` in
  `scope.py`). §Who sees which firm below.

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

## Who sees which firm (decided 2026-10-31, PR #17 and dashboard PR #35)

**The CRM and Studio Space share a backend and a database, not firms.** The CRM's
firms are `b2b_client`, Studio Space's are `partner`, and on 2026-10-31 only 16 of
the 29 `partner` firms matched a CRM firm, by phone. Before PR #17 nothing carried
an assignment across.

- **Firm visibility:** an admin sees every firm; everyone else only firms assigned
  to them. Outreach and inbound are held to it because their firms are not
  onboarded on Studio Space. Prospects, onboarding forms and the waitlist stay on
  market, because they are not assigned firms.
- **The CRM drives the KAM** (`app/firm_kam.py`, no migration): firm by phone,
  person by `kamPhone` on the latest assignment or one roster name that fits, login
  by phone. **Never a name to a login:** two different people share a first name
  across the CRM roster and Studio Space's staff, so a name match would hand one
  person's firms to the other. It runs after a CRM firm save, a roster change, a
  staff change and a provisioned firm, so a new login picks up its firms by itself.
- **It leaves a firm alone when unsure:** no CRM owner, owner not on the roster, no
  active login, a mobile two logins share, or CRM rows that disagree. Setting a firm
  to Unassigned in the CRM keeps Studio Space's KAM, so a blank cannot wipe a real
  assignment. A firm with no CRM match keeps the KAM chosen on its console page.
- **The CRM team list and Studio Space's staff are two lists.** Being on the first
  creates no login on the second. An admin adds people under console Team → Add
  somebody, with the same mobile as their CRM account, or nothing links. Merge PR #17
  before adding KAMs, or they see a whole market in between.
- **Failures leave little trace.** A refused CRM sign-in writes no row and
  `audit_log` records only successful writes, so "nothing happened" for a person
  is not visible in either.

## Numbers by firm

- **Tiles are lenses** (`ui/lens-tiles.tsx`). `studioLensMatches` gives both a
  tile's count and its list, and the per-KAM onboarding table uses the same
  `onboarded` predicate. Tiles count search plus KAM filter. The per-KAM table
  counts search only, so KAMs stay comparable while one is filtered.
- **The KPI.** KAM Studio Space Onboarding target is **25% of assigned firms**
  (`kpi-definitions.md`). It is counted here as a firm matched to a studio ÷
  firms with that KAM. A firm with no KAM is listed on its
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

- **A firm's status is decided per firm, not per number (2026-10-31).** The bug
  report was a firm with 8 logins, 7 of them Power, reading "Not onboarded" on a
  number the console shows against that firm. The CRM asked "does this one contact
  have a login?", and the firm's registered number had lost its link to a login.
  `set_login_phone` clears `team_user_id` when a login's mobile changes and the old
  number has orders, and the route inner-joined that column. `partner.phone` was
  never read either. `studioFirmOf` now finds the studio by contact number, then
  GSTIN, then exact company name (letters and digits only), and
  `firmStudioAccess`, the tiles, the KAM percentage and the amber notice all use
  it. A firm is Power if any login is. The per-number badge stays, and reads
  "firm on, number not" for a number the studio does not hold.
- **Why three keys.** Real firms were missed by phone alone, and their CRM and
  Studio names differ, so a name search misses them too; GST found those. One was
  found only by exact name. `normalizeCompanyName` is deliberately not used here:
  it strips "interiors" and "designs", which is safe for flagging a duplicate but
  would mark an unrelated firm onboarded. `partner.md_client_id` is empty on every
  studio, so these remain matches and not a link. On 2026-10-31 they matched 23 of
  28 real studios, against 13 on the live CRM. Checked in SQL against production;
  the route itself has run only on a throwaway database.
- **Unmatched studios are named, not dropped.** `studioFirmsNotInCrm` feeds an
  amber notice above the tiles. Test studios (`is_test`) are excluded. Until the
  backend change deploys, `firms` is absent, the old per-number answer applies and
  the notice stays hidden.
- **A firm can sit on several CRM rows.** Duplicate rows with a different number
  and no GST do not match, and only the Merge queue fixes that.
- **Two requests when Numbers by firm opens**, `fetchClients()` and the studio read. Either failing
  shows the red notice and tiles read Unknown, never zero onboarded.
- Access granted on Studio Space shows here within a minute (the read's cache).

## What is shared with Studio Space, audited 2026-10-31

Checked against production: Studio's Postgres (Metabase 38) against
`materialdepot_azure` (Metabase 5).

| Data | How it moves | State |
|---|---|---|
| Access (Power / Normal) | CRM reads `studio-access` | See above |
| Firm identity | Matched by phone, GST or exact name; `partner.md_client_id` is never set | No durable link |
| KAM | See the KAM section above (b2b-backend PR #17, draft). It finds a firm by any number, then GST, then exact name | 21 of 28 studios had no KAM on 2026-10-31 |
| Referred clients | `firms[].referrals` on `studio-access`, shown read-only on the Firm page. `GET /sync/outbox` is still unused, and `client_master.referred_clients` is empty on every row | Read from Studio, never copied |
| Orders into Studio | The dashboard asks the order service about every approved number, on page views and approvals, and files what it returns in `referral_order` | Complete for registered numbers |
| Orders into the CRM | Django `b2b-bulk` over the firm's CRM contacts, plus `firms[].orders` for numbers the firm does not list (below) | Django's figures are still wrong (below) |

- **An order is found by the buyer's phone and nothing else.** So an unassisted
  EC order is caught exactly when its number is registered, whichever store or
  channel it came through, and it is not labelled assisted or unassisted.
- **Registered numbers were complete.** All 56 orders on them from 18 Sep on were
  in `referral_order`. The 19 missing since 1 Sep were all placed by 16 Sep,
  before go-live and outside the service's look-back. Studio's docs call that about
  three weeks, but its snapshot on 2026-10-31 reported `since` 2026-09-17, about
  six. Whether that is a rolling window or a fixed date was not checked.
- **Unregistered numbers are the real loss.** `partner.phone` is not asked about
  unless a `referral` row also holds it, and 8 of 28 studios' were not. A check of
  `partner.phone` and of `estimate.client_gst` found 6 orders since go-live on
  4 studios that Studio never saw. The GST half used Studio's and the CRM's GSTINs
  together, which covers 21 of 28. Numbers cannot be auto-added: `matches_orders` requires admin
  approval because the number earns incentive. A number added late only recovers
  orders inside the look-back.
- **Studio orders count towards CRM revenue (2026-10-31, the user's call).**
  `withStudioOrders`, inside `useClientAggregates.metricsFor`, adds a firm's
  `referral_order` rows on numbers the CRM firm does not list: orders, revenue and
  last order, so Active/Inactive follow. Rules: an order on a listed number is
  skipped because `b2b-bulk` already counts it; cancelled and rejected rows are out
  and pending rows are in; it uses the ledger, not `b2b-bulk`, so a referred
  client's orders from before the referral never count; a firm matched by name only
  adds nothing, because a duplicate row could otherwise count the same orders
  twice. The Firm page says how much of the figure came this way. The history only
  goes back to Studio's look-back. **The Overview's totals are not included:**
  `use-overview-data.ts` calls `clientMetricsFrom` directly, and a revenue report
  was being built there that day.
- **A failed Studio read drops these orders silently,** and revenue falls to
  Django's figure. That figure is a floor, not a guess, so it is not marked Unknown.
- **Adding a number from the CRM.** Studio had no staff route: only the firm could
  add one. `POST /b2b/studio-number` (managers and admins, enforced in `relayB2B`)
  adds it approved, and the Firm page offers "Add to Studio Space" beside any number
  of a matched firm that Studio does not hold. It refuses a number on another firm.
  Orders arrive on the next pull, only inside the look-back.
- **A cancelled order can disagree with `estimate_status`, and Studio is the one to
  believe (2026-10-31).** Two orders read Cancelled on Studio while `estimate` said
  `order_confirmed` and `order_placed`. The order service sent
  `delivery_status: cancelled` for both, nothing was delivered, no PO exists and the
  estimate had not changed since the day it was placed. So `saysCancelled` stays.
  `estimate_status` lags generally: 16 of 56 orders read delivered in the service
  and something earlier on `estimate`. Do not "fix" this in Studio; it needs Django
  to write the status back, and until then `b2b-bulk` may count such orders.
  `oms_sales_order_line.cancelled_qty` is not a usable test: fully "cancelled" lines
  sit on delivered orders.
- **The three order figures do not agree, and two are wrong.** One firm checked on
  the live screens on 2026-10-31 had 30 placed orders in `estimate`. The console
  showed 1, correctly for what it holds: Studio only ever fetched inside its
  look-back. The Client Database showed 7 under a "lifetime" label, exactly the
  orders from 2 April on, and a last order a month before the real one, matching
  no estimate, so the firm read "Inactive 1 month" when it was Active. This is
  `backends.md` §Owed by Django row 1, and the CRM cannot correct it: no other
  response carries the right figure.
- **"Architect/Designer" on a lead is a yes/no** (`architect_involved`). It names
  no firm, so it cannot attribute an EC order. `estimate` has no architect or
  referrer column either, and `user_refferred` was not examined.
