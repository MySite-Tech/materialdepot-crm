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

- **No iframe.** `studio.materialdepot.com` answers `X-Frame-Options:
  SAMEORIGIN` behind a Cloudflare challenge (checked with `curl -I`, 2026-10-29),
  so an embed renders blank. The link opens a new tab with `noopener`. Access
  to Studio Space is that site's own login.
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
- Needs b2b-backend `b2b-studio-access`. Until it is deployed the tab reads
  Unknown.
