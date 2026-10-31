*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchMyReferrals()` | `GET /api/b2b/ec-referral` → b2b-backend `GET /b2b/rows` | One per mount. Answers only the caller's own referrals, newest 20, as a summary |
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
- **Who may use it is `canReferToB2B`, checked in the route as well as the tab.**
  The slug `crm.ec_b2b_referral` when the account has a permission list, else
  `EC_REFERRAL_ROLES`. **Nearly every account has a list, so the tab reaches
  nobody until the slug is ticked under Admin > Users** (or the list is
  backfilled). The role set only reaches accounts with an empty list.
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
