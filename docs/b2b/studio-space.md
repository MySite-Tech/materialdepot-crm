*Part of `docs/b2b/context.md` — see that file for the module overview.*

**Covers:** `components/b2b/views/studio-space/** · components/b2b/models/client/derived/studio.ts`

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchClients()` | b2b-backend `rows` (via `app/api/b2b/[...path]`) | The only call on mount |
| `addPhones()` (`useClientAggregates`) | Django `b2b-bulk` | Only when a firm is opened, for that firm's numbers |

## What the tab is (2026-10-29)

It replaced Partner Content in the B2B nav. It does two things: a link out to
`studio.materialdepot.com`, and the KAMs' account-maintenance list. That list
shows, for every firm, which numbers are on Studio Space and with what access.
The marking itself is made on the Firm page (`client-db.md` §Each number).

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

## Not synced

The marking is the CRM's record only. It is not read from Studio Space
(`partner_user.visible_tabs` in b2b-backend, where `NULL` means the whole
dashboard), and it does not change it. Until a phone-keyed `/sync` endpoint
exists, a number marked Power user here can still be restricted there, and the
reverse. The tab's footer says so.
