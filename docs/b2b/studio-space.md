*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/views/studio-space/** · components/b2b/models/client/derived/studio.ts`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| iframe | `studio.materialdepot.com/console` | The default pane. Not a CRM request: the browser loads Studio Space itself, with the KAM's own Studio Space session |
| `fetchClients()` | b2b-backend `rows` (via `app/api/b2b/[...path]`) | Only when **Numbers by firm** is opened |
| `fetchStudioLogins()` | b2b-backend `studio-access` (relay) | Numbers by firm only. Every Studio Space login with its mobile and `visible_tabs`; shared 60 s cache |
| `addPhones()` (`useClientAggregates`) | Django `b2b-bulk` | Only when a firm is opened, for that firm's numbers |

## What the tab is (2026-10-30)

The Studio Space admin console itself, framed full-height in the tab
(`ui/console-frame.tsx`, `src` = `/console`). A KAM signs in there with their
Studio Space email and password and works the console without leaving the CRM.
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
  the sandbox. Signing in inside the frame has not been tried yet.
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
