# BDA Retail

**Covers:** `components/bda-retail/**` · `lib/bda-retail/**` · `app/api/bda-retail/route.ts` · `lib/server/bda-retail.ts`

A central calling team for retail leads the stores missed. Built 2026-11-26 from
the "BDA Retail: B Plan" sheet. The program starts in December 2026. November is
the first month in the bank.

**The bank lives in b2b-backend** (migration 0033: `bda_lead`, `bda_call`,
`bda_import`, `bda_plan`; router `app/routers/bda_retail.py`), since 2026-11-26
at the user's ask. A fetch is kept, so nobody fetches to see leads. Before that
it was a local JSON file, and the first fetches never left one laptop.
b2b-backend owns only what must hold under concurrent writes: the first claim
wins, only the claimer logs calls, and an import never removes a lead, a claim
or a lead's `enteredOn`. Who may see what is decided in `app/api/bda-retail`.

## Data

| Call | Endpoint | Why |
|---|---|---|
| `fetchBank` / `importLeads` / `claimLead` / `logCall` / `releaseLead` / `savePlan` | `GET/POST /api/bda-retail` → b2b-backend `/b2b/bda/*` | The bank, claims, calls, import runs and the per-month plan |
| Carts, last 30 days | `/crm/leads/?created_from&created_to` | Added to cart, and pending carts |
| Older open carts | `/crm/leads/?status=In Cart` and `?status=Quote Approval Pending`, 31–90 days | Pending carts |
| Phase orders | `/crm/leads/?order_from&order_to&category=<phase list>`, one per phase | Upsell |
| Earlier civil and carpentry | the same, 61–180 days back | Upsell, decorative only |
| EC visitors this year | `/crm/footfall-no-cart/` and `/crm/footfall-non-converted/`, 365 days | "No EC visit" |
| EC visits, no cart | `/crm/footfall-no-cart/`, 30 days | No cart created |

On mount the tab makes one request (`GET /api/bda-retail`; the route makes one or
two backend calls). **Fetch new leads** is an admin's click, not a mount. It reads
Django in that admin's browser, because nothing on the server can read Django
without a person's token (b2b-backend's MD keys cover file uploads and invoices
only; Owed by Django row 21). It pages every source at 1,000 rows, capped at 40
pages each. Past the cap it saves nothing and names the source that overflowed.
Leads go up 1,000 per request, and a run is recorded only after every batch. A
failed batch leaves earlier batches saved, and the next fetch completes them. On
26 Nov one fetch read about 15,500 carts and 17,000 orders. The second fetch
that day saved nothing and left no server trace. A year of footfall overflowing
the old 15-page cap is the likely cause, not confirmed.

## Who can open it

Two kinds of people, by the user's decision on 2026-11-26:

- **Admins: the five names in `BDA_RETAIL_ACCESS`.** They get Overview, My queue,
  My performance, Lead bank and Team, the whole bank, fetching, the plan and
  returning a lead to the queue. Matching is by the exact Django name. The route
  refuses a name that more than one roster login shares, so a namesake cannot get
  in. Team → "Who can open BDA Retail" shows each name's match. "No login has this
  exact name" means a spelling difference: fix the list, not the check.
- **The `bda_retail` role ("BDA Retail" in Admin > Users).** Such a user's CRM has
  only this tab, whatever their permission list (`resolveAllowedTabs` returns early,
  like the site-audit-only roles). Inside it they see only My queue and My
  performance. The route gives them their claimed leads, the unclaimed leads in the
  month's active priorities and only their own calls, never the whole bank, and
  refuses fetch, plan and release with 403. **Whether Django's permission table
  accepts `bda_retail` is untested.** Saving the role on a real account is the test
  (Owed by Django row 21).

There is no permission slug, on purpose, so Admin > Users cannot grant the admin
views to anyone else. Checked on the Django stub and a local b2b-backend on
2026-11-26: an admin saw all five views and 7,822 leads. A `bda_retail` user saw
only this tab, the two views and 2,372 leads, and got 403 on fetch, plan and
release. Their call saved and showed on My performance. A name on neither list
gets no tab and a 403.

## Cohorts (`lib/bda-retail/cohorts/`)

Priorities are the sheet's "till December" column. One lead per customer: when a
phone fits several cohorts the highest priority wins, then the order in
`COHORTS`. The bank also skips a phone that already has a lead entered within 30
days under another cohort (`samePerson`).

- **Added to cart, no EC visit (P1):** an open cart created in the last 30 days, no
  order since the newest one, and the phone is not among this year's EC visitors.
  **`/crm/leads/` rows carry no `visits`**, although `CRMLeadRow` types it. The
  first fetch trusted it and put every open cart here. Footfall's two drill-downs
  are the visitor list now. A visitor who converted is in neither list, so one
  with a newer cart can land here. That gap is accepted.
- **Pending carts:** an open cart whose last touch (created date or latest remark)
  is 7+ days old. Quote Approval Pending is P1, In Cart is P2.
- **Upsell:** phases map Django categories (`PHASE_CATEGORIES`, the user approved
  the lists). The latest order in a phase is 30–60 days old (`UPSELL_LAG_DAYS`, the
  user's 30-day lag) and nothing in the next phase since. Carpentry → decorative
  is P1, civil → carpentry is P3, both by the user's rule. A civil buyer who
  skipped to decorative still counts, because they never bought carpentry.
  Decorative-only (P3) means no civil or carpentry order in 180 days, so the call
  asks where those were bought. The `category` filter does filter: the three
  phase fetches returned different counts.
- **EC visit, no cart (P3):** footfall's no-cart list for 30 days, minus anyone
  with a cart. **Its rows have no visit date and no branch** (`user_id`, `name`,
  `contact`, `bm` only), so these leads enter on the day of the fetch and cannot
  be sorted by most recent visit as the sheet asks. Owed by Django.

**A cart a BM is working is left out:** a remark in the last 7 days, or a
follow-up date today or later. On 26 Nov that left out about 6,000 customers. The
Overview's Last fetch card splits it by rule. Check that split before trusting
the cohort sizes: if most are "follow-up ahead", Django probably sets a default
follow-up on every cart and the rule is too broad.

**A cart over ₹1 Cr is not a value** (`MAX_PLAUSIBLE_VALUE`). Real carts on
26 Nov included ₹54 lakh crore and ₹3 lakh crore. 43 leads were over ₹10 L,
against a median of ₹5,400. One of them made every total and the value sort
meaningless. Such a cart counts as no value, and its figure stays in the lead's
"why" text.

## The queue

LIFO by the user's choice: follow-ups due, then retries (no answer on an earlier
day), then **Next up**: unclaimed leads in the month's active priorities, P1
first, newest `enteredOn` first, value only breaking ties. Opening a lead from My
queue claims it. Opening from the Lead bank does not, so a manager browsing takes
nothing. `enteredOn` is when the lead qualified: the newest cart date, last touch
plus 7 days for an idle cart, order date plus 30 days for upsell. The bank's
months are those dates.

The plan (`PLAN_PRIORITIES`) is the sheet's: P1 only until December, P2 from
January and P3 from March. The Overview's checkboxes override one month. Every
cohort goes into the bank from the start, so P2 and P3 have history when they
switch on.

A call needs an outcome. Connected outcomes need a note, and follow-up outcomes
need a date. Three unanswered calls with no connection make a lead Unreachable.
"Said they'll order" is the BDA's word, not a matched order. Conversions against
real orders are not built.
