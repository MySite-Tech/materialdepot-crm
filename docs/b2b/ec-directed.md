*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchEcVisits({ kind: 'redirect' })` | `GET /api/b2b/ec-visits?kind=redirect` → b2b-backend `GET /b2b/ec-visits?kind=redirect` | One per mount. The whole tab. Needs migration 0023 |
| `saveEcVisit(v)` | `PUT /api/b2b/ec-visits` → `PUT /b2b/ec-visits` | A redirect, a status change, or a saved orders check |
| `checkAssisted(v)` | `fetchClientTickets(phone)` → Django `GET /crm/leads/?q=<phone>` | One per phone on the redirect, **only on a click** ("Check orders", or "Check orders for N", two at a time) |

## EC Directed: B2B as a lead source for the stores (2026-10-30)

The user wants B2B measured as a lead-generation channel too, not only on its
own sales. Any team (Inbound, Outreach, KAM) can send a client to an Experience
Centre from the lead or firm drawer (`ui/redirect-to-ec.tsx`). KAM can do it
again and again for one firm. The EC Directed sub-tab lists every redirect, and
what those numbers then ordered at that EC is **assisted revenue**.

- **A redirect is a row of `b2b_ec_visit` with `kind = 'redirect'`**, status
  `Directed`. It is not a new table: the EC visit already had the firm, branch,
  purpose, BM and by/at. Migration 0023 added `kind`, `source_team`, `lead_ref`
  (the record it came from), `phones` (every mobile on the lead), `note` and
  `assisted`, and made `visit_date` optional. A redirect with an expected visit
  date shows in the Appointment Tracker like any visit, and one without a date
  never matches the tracker's date range.
- **Assisted revenue never adds to a total.** The same order is already in the
  EC's revenue. The user: "we won't be counting it twice". It is shown as B2B's
  contribution only.
  The Overview's EC-directed channel (`overview.md`) is wider than this tab: it
  needs no logged redirect and no click, and sits in B2B's influence total, which
  is compared with the B2B target and is never added to company revenue.
- **What counts:** an order (`dealIsOrder`) on any of the redirect's phones,
  whose cart's branch canonicalises (`apptBranchesFromCrm`) to the redirect's EC,
  created on or after the redirect day. The user said the timing does not
  matter beyond that: there is no N-day window.
- **The branch is the cart owner's, not where the order was booked.** That is
  the only branch `/crm/leads/` returns (`client-db.md` §One enquiry). For an EC
  walk-in the cart is usually opened by that EC's staff, so it is a fair proxy,
  and the tab says so under the total. The exact rule needs Django to return
  each order's booked-at branch and placement date in bulk
  (`docs/backends.md` §Owed by Django, row 8). Then this can be computed on
  load instead of on click.
- **Why on click, and saved.** No Django call returns per-phone orders with a
  branch in bulk, and one request per row on mount would break the ten-request
  budget. So a check fetches that redirect's phones and stores the result on
  the row as `assisted {value, orders, enqIds, checkedAt}`. The tiles sum the
  saved checks and say "N of M checked". A failed fetch shows on the row and
  stores nothing, so it never reads as ₹0.
- **Who sees what:** a rep sees the redirects they made (`scheduledBy`), and a
  manager or B2B admin sees all of them.
- **Footfall is not shown.** `/crm/lead-visits/` has no branch, and the footfall
  endpoints report totals, not visitors. The row's status (Directed → Visited /
  No show / Cancelled) is set by hand until Django can answer "did this number
  walk into this EC".
