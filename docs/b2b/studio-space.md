*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/views/studio-space/** · components/b2b/models/client/derived/studio.ts`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchClients()` | b2b-backend `rows` (via `app/api/b2b/[...path]`) | On mount |
| `fetchStudioLogins()` | b2b-backend `studio-access` (relay) | Every Studio Space login with its mobile and `visible_tabs`; shared 60 s cache |
| `addPhones()` (`useClientAggregates`) | Django `b2b-bulk` | Only when a firm is opened, for that firm's numbers |

## What the tab is (2026-10-29)

It replaced Partner Content in the B2B nav. It does two things: a link out to
`studio.materialdepot.com`, and the KAMs' account-maintenance list. That list
shows, for every firm, which numbers are on Studio Space and with what access.
Access is read from Studio Space, not marked here (§Read from Studio Space below).

- **An embed is possible, and not built yet.** The `X-Frame-Options:
  SAMEORIGIN` that `curl -I` and headless Chrome see on `studio.materialdepot.com`
  belongs to Cloudflare's bot-challenge page only. In a real Chrome the app sends
  no `X-Frame-Options` or CSP, and on 2026-10-30 an iframe of its `/login`
  rendered inside the production CRM page. `crm.materialdepot.com` and `studio.`
  are **same-site**, so Studio Space's session cookies travel into the frame
  (b2b-backend `cookie_samesite` defaults to `none`). Still untested: signing in
  inside the frame, and a KAM who has never passed the Cloudflare challenge
  (its page cannot frame, so keep the new-tab link as a fallback). Dhruv wants
  subtabs mirroring the console's nav (`b2b-dashboard`
  `components/shell/nav.ts`: Overview, Needs attention, Leads, Visits,
  Onboarding, Waitlist, Firms, Rewards, Records, Catalogues, Team, Usage, Log),
  each framing its `/console/...` page. That needs a chrome-less embedded mode
  in `b2b-dashboard`. Until then the link opens a new tab with `noopener`.
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

- **Two requests on mount**, `fetchClients()` and the studio read. Either failing
  shows the red notice and tiles read Unknown, never zero onboarded.
- Access granted on Studio Space shows here within a minute (the read's cache).
- Needs b2b-backend `b2b-studio-access`, which ships inside PR #14. Until
  that is deployed the tab reads Unknown.
