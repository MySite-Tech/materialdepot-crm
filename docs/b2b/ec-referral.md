*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchEcReferrals(view)` | `GET /api/b2b/ec-referral?view=mine\|store\|admin` → b2b-backend `GET /b2b/rows`, plus `GET /b2b/ec-visits?kind=redirect` for store and admin | One per sub-tab open. Every row, no cap |
| order history | `fetchB2BBulk(phones)` → Django `/crm/leads/b2b-bulk/` | One per sub-tab open (two above ~290 numbers), over the referred numbers |
| `sendEcReferral(input)` | `POST /api/b2b/ec-referral` → `GET /b2b/rows`, then `POST /b2b/rows` | One per submit. The read is the duplicate check |
| EC list | `branches` from the CRM shell (`fetchBranchList`) | No request of its own: `ecB2bReferral` is in `needsBranches` |

## EC B2B Referral: store staff hand a walk-in B2B client to Outreach (2026-10-31)

A top-level CRM tab, not a B2B sub-tab, because the people filling it have no
B2B Sales access. It writes an Outreach lead with `source = 'EC B2B Referral'`
and `bm = ''`, so it lands in Outreach → Assignments → Unassigned pool. A B2B
manager or admin assigns it from there or from the Leads tab, and the BM accepts
or rejects as for any assigned lead (`outreach.md` §Admin assignment).

- **It has its own route because `/api/b2b/[...path]` is B2B-only.** `relayB2B`
  gates on `canUseB2B`, and a store user fails that. Widening the relay would
  hand store staff every B2B row. The route builds the lead itself from
  whitelisted fields, so a caller cannot set `bm`, `source` or the referrer, and
  `GET` returns a summary of their own rows and nothing else.
- **Every signed-in account gets it, 2026-11-03, by the user's ask.** The tab is
  appended in `resolveAllowedTabs` whatever the permission list or role says, and
  the route only needs a session. Site-audit-only roles still see just Site Audit,
  but the route does not refuse them. **Unticking `crm.ec_b2b_referral` removes
  nothing.** The tab is appended after a list's own tabs, so an account's landing
  tab does not change.
- **A number already held is refused, 409, naming who holds it:** any Outreach
  lead that is not Lost, or any firm in the Client Database, on the same 10-digit
  mobile. If the check cannot read `/rows`, nothing is written. A number whose
  Outreach lead is Lost can be referred again, as a new row.
- **The referrer is on the row twice, on purpose.** `ec_referral {ec, by, byPhone,
  at}` is the record of who sent it and answers "Your referrals". `ec_name` and
  `ec_bm_name` fill the Leads tab's Assisted at EC, because here that claim is
  attested by the person making it.
- **`ec_referral` needs no migration.** Unmapped meta keys go to `extra`
  (b2b-backend 0020, live). It must stay in `OUTREACH_META`, or the mapper drops
  it on the next save.
- **Coverage KPI:** the source is in `COVERAGE_SOURCES`, so it counts like Inbound
  and the older hand-picked `EC referral`, which stays for existing rows.
- **BMs cannot pick this source in + New lead** (`OUTREACH_ENTRY_SOURCES`). Such a
  lead would have no EC or referrer behind it.

## Three views: the EC, the store manager, the admin (2026-11-06)

The user asked for full transparency both ways. One tab, three sub-tabs, and
the route decides who gets which (`lib/b2b/ec-referral/utils.ts`; the UI uses the
same predicates only to hide the buttons):

| Sub-tab | Who | What |
|---|---|---|
| Refer a client | everyone | The form, then every referral the caller sent (by `ecReferral.byPhone`), where each is now (waiting, with which rep at which stage, converted, lost) and the orders on each number |
| Sent to your store | assistant store manager and up (`depth ≥ 2`), or a B2B manager | B2B → EC redirects (`b2b_ec_visit`, `kind='redirect'`) into the caller's ECs, plus that store's own referrals to B2B |
| All referrals | area manager and up (`depth ≥ 5`), or a B2B manager | Both directions company-wide, filtered by direction, EC, date range, status and a search, with a per-EC table |

- **A store manager's ECs are their Django branches**, canonicalised with
  `apptBranchesFromCrm`, as the Appointment Tracker does. No branches, or an
  admin role, means every EC (an empty `allowedBranches` means all, see
  `docs/landmines.md`). A redirect's branch matches only when it canonicalises to
  exactly one of them.
- **Orders on a referred number are lifetime, not since the referral.**
  `b2b-bulk` answers per-phone aggregates with no order dates by row. A number
  whose first order predates the referral says "ordered before the referral",
  so the total is not read as all B2B's doing. A number whose history did not
  load reads Unknown and is counted apart, never as ₹0.
- **Redirect orders are the B2B team's saved checks** (`assisted`, `ec-directed.md`).
  The store view shows "Not checked yet" rather than computing them, because a
  per-branch figure needs one request per phone.
- **The old hand-picked `EC referral` source is not listed.** Those rows have no
  `ecReferral` record of who sent them or from which EC.
