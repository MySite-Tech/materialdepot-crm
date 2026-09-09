# components/store-visit

**Covers:** `components/store-visit/**` · `lib/api/ops/store-visit.ts`

## Purpose
The in-store visit capture form — the kiosk/receptionist flow that records a
walk-in, resolves or creates the client, collects the user-info answers and
assigns a BM.

## Data

| Step | Call | Endpoint |
|---|---|---|
| branch list | `fetchBranches` | Django, `lib/api/crm/branches.ts` |
| phone lookup | `lookupLeadByPhone` | `POST /store-visit-lead/` |
| record the visit | `syncLeadToKylas` | `POST /store-visit-lead/` (same endpoint) |
| question list | `fetchUserInfoProperties` | `GET /user-info-property/` |
| save answers | `saveUserProperties` | `POST /user-property/` |
| BM options | `fetchBMsByBranch` | `GET /store-visit/bms-by-branch/` |
| assign a BM | `assignBMToClient` | `POST /store-visit/assign-bm/` |
| Kylas lead read/write | `fetchLeadById` / `updateLead` | `kylasFetch /leads/{id}` |
| contact lookup | `searchContactByPhone` | `kylasFetch POST /search/global-search` |

**`components/store-visit/form/api.ts` exports an object called `mockApi`. Nothing
in it is mocked** — it is a thin pass-through to the real `@/lib/api` functions.
The name is a leftover; do not go looking for fixtures behind it.

## Things that are easy to get wrong

- **One endpoint, two jobs.** `POST /store-visit-lead/` both *looks up* a phone
  and *records* the visit; which one happens depends on the body. Lookup sends
  `{ contact, branch }`; recording adds `interested_categories`, `user_type` and
  optionally `name`. So a "read" here is a POST and is not covered by `mdFetch`'s
  GET dedupe.
- **Branch is upper-cased on the way out** (`branch.toUpperCase()`) in all three
  store-visit calls. The branch strings the UI holds are mixed-case, so compare
  case-insensitively.
- `lookupLeadByPhone` returns `newVisit`, which is what distinguishes a first-time
  walk-in from a repeat, plus `footfallCount`, `currentSalesBM` and any existing
  `userProperties` (keyed by numeric property id) for pre-filling.
- **`fetchUserInfoProperties` fetches every property and filters client-side.**
  It calls `/user-info-property/` with no query and then keeps the ids the caller
  asked for. The list is small, but a question that does not exist in the DB
  simply never appears — with no error. That is the same failure mode that hid
  lead priority; see the ticket-only note in the Django repo.
- **`updateLead` re-sends the entire lead body.** It spreads `fullLeadBody` and
  merges `customFieldValues`, which is why `fetchLeadById` must run first. Kylas
  rejects the whole PATCH if any single field in that map is stale, so never
  construct a partial body.
- **`updateLead` writes the phone into `lastName`** and uses
  `name?.trim() || contact` for `firstName`. So an unnamed walk-in becomes a lead
  whose first and last name are both the phone number — that is the "a name that
  is the phone number again means no name" signal the B2B side keys off.
- `searchContactByPhone` swallows every error and returns `null`, so "no contact
  found" and "Kylas is down" are indistinguishable at the call site.
