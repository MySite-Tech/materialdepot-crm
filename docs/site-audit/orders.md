*Part of `docs/site-audit/context.md` — see that file for the module overview.*

## Order attribution: exact matching only

`orderBelongsToBm` (`components/site-audit/views/bm/index.tsx`) decides who owns an order, and is
reused by every view that lists orders so they can never disagree. Precedence:

1. `bm_email` present → it **decides alone** (a name match must not override it).
2. Else `phoneKey(row.bm)` vs the person's contact digits.
3. Else exact normalised name, against `BmProfile.name` **and** `aliases`.

`aliases` carries the *other* authoritative name for the same person — the field
profile's name vs the CRM's `f_name + l_name` — because many profiles were
created from a short display name ("Anubhab") while order rows carry the full one
("Anubhab Sarkar"). Both come from records already tied together by an exact
phone match, so this is still exact matching.

**Never introduce fuzzy/similarity matching here.** When a lot of rows fail to
attribute, the question is "which profile or `bm_email` link is missing", not
"should the match be looser". Same rule holds for the COE's imported
`wp_production` rows with a blank `bm`.

**Write `bm_email` at the point the BM is chosen — the phone is the join.**
196 audit orders reached 2026-08-31 with `bm_email` NULL because none of the
three writers set it: the auto-import dropped the `bm.contact` the backend
sends (`_site_audit_serialize_bm`), and the Add Order overlay + the drawer's BM
assign guard on `match.email` while their BM list (`fetchUsers()`, the CRM
roster) has no email field at all — so the guard was always false and only a
name was written. All three now resolve it through
`fetchBmEmailsByPhone()` (`shared/staff/bm-link.ts`): `phoneKey` → the single
`profiles` row with `role='bm'` carrying that number, ambiguous numbers dropped.

Do NOT reach for `profiles.name` to close that gap. Every live BM profile came
from the CRM sync holding a FIRST NAME ("Anubhab", "Shaikh") while orders carry
the full one ("Anubhab Sarkar") — name matching against profiles resolved 0 of
the 196. The Users-view backfill goes order name → exactly one CRM roster
employee with that exact name (the roster has `f_name + l_name`, the same
string the order got) → their phone → the BM profile. Two exact hops, no
similarity, and store names ("Whitefield") and "Anubhab/Zaid" match nothing and
stay in the by-hand list, which is correct.

`bm_email` is only on `audit_orders`; never add it to an `install_orders`
payload — PostgREST rejects the whole insert on an unknown column.

**A BM with no `profiles` row is unlinkable by construction** — `bm_email` has
nothing to point at, no picker lists them, no backfill resolves them. The Users
tab surfaces active CRM users whose permission maps to `bm` and who have no
profile (19 on 2026-08-31) and creates the accounts on request. This is the ONE
exception to "don't provision field-app logins for desk staff": a BM profile is
the join target order attribution needs. Branch managers and service managers
still get nothing — they render from their CRM session and slug.

The store pre-booking sheet picks the BM from `profiles` instead of taking free
text, because that public kiosk route was the single biggest source of
unattributable names (66 of 128 rows: `Janvi` for the account `Jhanvi`, `Soheb`,
`Beema`, and the store's own name when the field was optional).

**The name on the order is not the attribution — the enquiry's owner is.**
`components/site-audit/data/resolve-bm-from-backend.ts` reads `bm: {name, contact}` off the jobs feed
(`/api/site-audit/install-pos`, the one the auto-import already pages) keyed by
`estimate_lead_id`, and links on phone. This needs NO backend endpoint and no
judgement about whether someone "is a BM" — being the estimate's owner is the
whole answer, and `permission_name` disagrees with it constantly (Harsh Singh:
~1500 clients, label `manager`). The enquiry id is in `pi` for CRM rows and in
`po` for store pre-bookings, whose `pi` is the generated `SRES-…` slot id.
`autoLinkBmsFromRows` runs this inside the auto-import reconcile from the page
of jobs already in hand — no extra request, no button — so new rows self-repair;
the Users-tab button is only for backlog older than a reconcile page.

**The phone is the identity; `bm_email` is only how it is stored.** When the
owner has no field-app account, writers record the synthetic address that
ENCODES their number (`crm.<10 digits>@site-audit.internal`) rather than
recording nothing, and `orderBelongsToBm` compares `bmPhoneOfOrder(row)` against
the viewer's `phoneKey(contact)` FIRST. A BM's CRM session knows their number
long before anyone creates them a profile, so attribution no longer waits on an
account existing — and when the account is created it lands on that very same
synthetic address, so no row needs rewriting. Creating the account is now about
giving someone a dashboard, not about making their orders findable. Phone is
required when adding a Site Audit user for the same reason.

Tables (Site Audit Supabase): `audit_orders` (site audits **and** store
pre-bookings — see the next section; has `bm_email`),
`install_orders` / `install_orders_slim` view (installations, **no `bm_email`
column** — always resolves by name/phone), `wp_production` (custom wallpaper
runs, has `bm_email`), `profiles`, `app_settings`, `foam_ledger`.

## The BM's order book: three tables, three drawers, one conversion funnel

`SiteAuditBmView` is the BM dashboard; `components/site-audit/views/owned-orders/` holds the Installations
and Custom Wallpaper halves of it, and both are reused by
`SiteAuditBranchManagerView`'s store rollup. Every list opens a drawer; the two
new ones are read-only apart from declaring which site audit an installation
came from, since scheduling stays with the SM and wallpaper production with the
COE.

**Drawer data is fetched per order on open, never added to the list select.**
`log` is jsonb averaging ~7 KB a row and both lists poll every 30s, so the
install/wallpaper drawers read `log`/`service`/`skus`/`notes` for the one row
being looked at (`INSTALL_DRAWER_COLS` / `WP_DRAWER_COLS`). The one thing lifted
into a list select is `auditBy:service->>audit_by` — PostgREST json path with an
alias, so the row can badge audit ownership without carrying the SKU blob.

**Who did the site audit** lives in `install_orders.service.audit_by`
(`material_depot` | `customer` | unset — 192/179/57 of live rows), set by the SM
and auto-detected at creation by `detectAuditBy`. On a Material-Depot-audited
installation, `LinkAuditSection` finds the audit behind it:

1. a declared `jobCardLinks` link wins (either direction — `LinkInstallSection`
   writes the same pair from the audit side);
2. else audits sharing the client's exact phone digits, **pre-bookings
   excluded** — a `slot_reserved`/`slot_converted` row is a held slot, not the
   audit, and its phone is often the store's own;
3. exactly one candidate → shown as "matched by phone" with the visit date on
   it (157 of 182 live rows land here); **two or more → nothing is picked**, the
   BM chooses (16 rows), and that choice becomes the declared link; none → said
   plainly (9 rows), which almost always means the audit was booked against a
   different number.

Matching on `pi` is near-useless here and measuring it is why the fallback is
phone: only 4 of those 182 installations share a `pi` with their audit, because
the audit is raised pre-sale and the installation post-sale against the order's
PI. `LinkAuditSection` takes `attribution` — **omit it and the section goes
read-only**, which is what the branch-manager rollup does: a link nobody can be
named for is not worth writing.

`WpLadder` (`components/site-audit/coe-ops/wallpaper/ladder.tsx`) is the read-only custom-wallpaper stage
ladder, shared by the COE's Wallpaper tab and both BM drawers so the BM can
never be shown a stage list that has drifted from the one the COE is working. A
custom-WP installation resolves its production run by `install_order_id` or
exact `pi` (verified: every run with the id set agrees on `pi`), **never by
phone** — one client's two projects share a number.

## Conversion: did the audit become an order, and where did it stop

`components/site-audit/data/conversion-funnel.ts` answers the question the BM dashboard exists for. Six
steps — audit → cart → quotation → order → installation ordered → installed —
where the middle three come from the **CRM's own Django deal pipeline**
(`/crm/leads/?q=<phone>`), which is where carts, quotations and orders actually
live. This is the swap `coe-ops/shared.ts`'s `orderPlacedFor` comment
anticipated ("when Material Depot's other system exposes carts and product-only
orders, this is the ONLY function that has to change"), reached from inside the
CRM; the two agree, in that an installation order on/after the audit day still
counts as an order placed.

Three rules that must not bend — the second and third were live bugs in the
first draft of this module, caught by exercising `funnelFor` against synthetic
cases before it shipped:

- **Deals are scoped to the audit day**, never to the phone's whole history —
  otherwise a fresh audit is marked converted off an unrelated order from last
  year. Earlier deals are reported as context (`priorDeals`) and never as
  conversion.
- **`unknown` is a distinct state from `pending`.** A failed
  `fetchCRMLeads` means we don't know whether a cart exists. Folding that into
  "no cart yet" would turn one Django outage into a dashboard full of clients
  who look like they walked away, and would send BMs to chase clients who have
  already paid. Hence `Funnel.unknownFrom` alongside `stalledAt`, its own
  "Pipeline unknown" tile, and `?` ticks in the ladder. (`fetchLeadDeals` in
  `mdFetch` (`lib/api/core/client.ts`) swallows its own errors into `[]` — the `Array.isArray`
  landmine above, one level up — so this module calls `fetchCRMLeads` directly.)
- **A lost deal is only the story when nothing else is still moving.** `lost`
  requires no live ranked deal AND no order: a client whose first cart was
  cancelled and whose second is in quote approval has not been lost.
  Symmetrically, `cart_created` is proved by ANY scoped deal including a lost
  one — a cancelled cart was still a cart.

A step with no local evidence *below* one that has some is `implied`, not a gap:
an order raised under a second phone number would otherwise render as "no cart,
no quote, order placed". `DEAL_PIPELINE` mirrors `STATUSES` in `components/crm/constants.ts`
(not exported from that 3.3k-line component); an unlisted status is unranked and
cannot advance the funnel. The B2B side names the same statuses once, in
`components/b2b/models/client/` (`DEAL_ORDER_STATUSES` / `DEAL_LOST_STATUSES`), which
`components/b2b/models/kam/auto-stage.ts` and the Client Database both read — this one stays separate
because it is a RANKED pipeline, not set membership, but a status added to the
CRM has to be added in both. There is deliberately **no "PI shared" step**: the deal
vocabulary has no PI status, and the Footfall/Weekly Funnel dashboards' PI
column is computed server-side from data this endpoint doesn't return.

Cost: one request per client phone, because the batched
`/crm/leads/client-order-history/` endpoint returns a *lifetime* furthest status
with no dates, which cannot be scoped to an audit. Mitigated by a module-level
cache, a concurrency pool of 4, and `FUNNEL_PHONE_CAP` — and the overflow is
**reported in the UI**, not silently dropped. The cache outlives the component,
so the drawer carries a "Re-check the CRM pipeline" button for a BM who has just
raised the cart.

Note this puts a Django call inside the Site Audit tab, so
`/site-audit-view?person=` (which never authenticates) now depends on a real
session for these three steps — it already did via `fetchUsers()`, and a failure
degrades to `unknown` rather than to a wrong answer.
