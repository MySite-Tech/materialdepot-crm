*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Data layer: why these reads are shaped the way they are

These constraints were previously recorded as inline comments in `lib/b2b/`.
They live here now because the code cannot carry them.

- **One paged read serves every board.** Each B2B view wants a different
  pipeline out of the same table, which used to be four
  `select=* where pipeline=…` round trips per dashboard load. `fetchAllRows`
  pages the table once and narrows by pipeline and date in memory.

- **A failed Kylas request is indistinguishable from a real zero, so owner
  totals cannot be derived.** `fetchB2BInboundLeads` catches internally and
  returns `total: 0`. Deriving the last owner's count by subtracting from the
  board total would therefore let a single 429 move one rep's leads silently
  onto another rep's card. `fetchInboundOwnerTotals` pays one call per owner
  (`size=1`, only `totalElements` is read) and is **opt-in**, cached separately
  from `fetchB2BData` — only `computeLeadership` reads it, so the Dashboard and
  Targets tabs no longer pay two Kylas calls for a number they never render.

- **Only cache a zero you actually received.** A phone the backend has no deals
  for is a real zero and worth caching. A phone whose request failed is not —
  the order-history cache has no TTL, so caching that would pin every card on
  the page to zero until a full reload. `zeroFill` takes a `cache` flag for
  exactly this.

- **`B2BBulk.ok` is false when the request failed, and callers must not present
  that as data.** A client with unknown dates renders **"Unknown"**, never
  "Inactive" — labelling someone inactive on the strength of an answer that
  never arrived is the bug this flag exists to prevent. `orderDatesFromAggregates`
  takes `ok` through to `loaded`, which is what gates `clientStatus`.
  **The money half of this was missing until 2026-09-10.** `zeroFill` puts a zero
  row in the map even when `ok` is false, and `clientMetricsFrom` counted those
  rows as real, so a dropped bulk call reported every client at ₹0 lifetime and
  ₹0 open value while the *dates* correctly said Unknown. It now skips any phone
  whose `dates.byPhone[p].loaded` is false, and the metrics come back `undefined`
  ("—"). Reuses the existing `loaded` flag rather than threading `ok` through a
  fourth signature.

- **Every stats read carries an `ok`, because an empty bucket is a plausible
  number.** `fetchB2BPipelineStats` and `fetchVerticalStats` both catch
  internally and fall back to `EMPTY_BUCKET`/`{}`, which renders as a confident
  ₹0 pipeline. Both now return `ok`, and the Dashboard shows a banner rather
  than the zeros. Same trap as the Kylas `total: 0` note above — a caught error
  behind a typed return is invisible at the call site unless the type says so.

- **`fetchTargets` returns `{store, ok}`, not a bare store.** The catch path
  returns `defaultTargetStore()` — the built-in 120L — which is indistinguishable
  from a team that genuinely set 120L. `saveTargets` likewise returned `void`
  and swallowed its error, so a target edit looked saved and was not; it now
  returns the message and the Targets tab renders it.

- **Enquiry-id matching is case-insensitive on both sides, but the id sent to
  the backend keeps its original case** so the indexed `__in` lookup hits
  exactly. `wireEnqId` preserves case for the wire; `normalizeEnqId` uppercases
  for local comparison.

- **Chart colours are assigned on the FULL list and travel with the row.** The
  donut drops zero-value sources and the legend does not, so colouring by
  position in either list shifts every source after a ₹0 one — the legend then
  names the wrong slice (HYD's revenue once read as Outreach's). `revenueBySource`
  carries a `color` per row and both the `<Cell>` and the legend swatch read it.

- **The Dashboard splits its load by dependency.** Only the pipeline and vertical
  stats depend on the range selector, so `loadBase` (board data, KAM resolution,
  client histories) runs once and survives a range switch, while `loadRange`
  re-runs alone. One stats request carries both the per-vertical groups and the
  overall B2B pipeline via `total_branch`, so switching range costs one call.
  `loadRange` keys on `[range, basis]` and costs **two** calls on mount, because
  the default basis is `order` and the created-basis call is still needed for
  open pipeline. A non-month range adds a third for the month-scoped revenue.
  Three is the ceiling.

- **The Dashboard has a date basis and a branch basis, and they are not
  independent.** `StatsBasis` (`lib/b2b/stats/pipeline.ts`) is `created` or
  `order`; `basisQuery` turns it into either `created_from/to` on the ticket, or
  `order_from/to` on `estimate.order_placed_time` **plus**
  `branch_basis=estimate`. The two always travel together, because Django's
  `branch` filter otherwise keys on the **cart owner's** branch, and that is a
  different population from the branch the order was booked at: in Sept 2026, 49
  of the 82 orders booked at B2B sat on carts owned by Gachibowli, HQ, JP Nagar,
  Whitefield or HSR staff. Filtering by order date alone moved the month from
  ₹13.44L to only ₹14.10L; adding the estimate branch moved it to ₹47.36L. Do
  not offer one without the other.

- **The Dashboard checks that Django honoured the basis.** `/crm/leads/stats/`
  echoes `basis`, `fetchVerticalStats` compares it to what it asked for and
  returns `basisApplied`, and the tab shows an amber notice when it is false.
  This is deliberately not cosmetic: the backend half deploys separately, and an
  older Django ignores `order_from` and answers with cart-created figures that
  look exactly like real ones. `basisApplied` is `true` when the request *failed*
  outright — that case is already `ok: false`, and two banners for one problem
  reads as two problems.

- **The basis toggle governs the whole page except open pipeline, and defaults
  to `order`.** The top panel, its status tiles, Order Won, Order Lost, Revenue
  Generated, Target Achieved, Month Projection and Revenue by Source all follow
  it. Two things do not and cannot: the **Open Pipeline** card and the
  **Pipeline by Vertical** panel, both of which read `active` off the
  created-basis call — a cart that is still open has no `order_placed_time` to
  be counted by, so under an order filter `active` comes back structurally 0.
  That zero is arithmetic, not a dropped call, which is why the Active Pipeline
  card is dropped from the panel on the order basis rather than rendered as ₹0,
  and why the panel relabels itself "Orders · placed" with counts in *orders*
  instead of *carts*. Both surviving cart-created figures say so in their own
  labels.

- **The Open Pipeline card reads `branchTotal.active`, and that is what makes it
  tappable.** It used to sum `verticals[].active`, which is keyed on the rep
  roster's phone numbers and carries **no branch filter** — so it quietly
  excluded B2B-branch carts owned by anyone not in `B2B_ROSTER` (45 carts /
  ₹48,12,240 branch-wide against 43 / ₹48,07,xxx for the roster in Sept 2026).
  A drill-down has to list the rows the card counted, and there is no clean
  `fetchCRMLeads` query for "owned by one of eight roster phones"; `branch=B2B`
  plus the four open statuses reproduces the branch total **exactly**, verified
  at 45 rows against 45. If you move the card back to the verticals sum, the
  drawer stops matching it — the badge landmine, one panel over.

  The "Pipeline by Vertical" accent tile still sums the verticals, because it
  must equal the tiles beside it. It is labelled **"All verticals"** rather than
  "Overall Pipeline" for exactly that reason: it is not the branch figure and
  must not read as though it were.

- **The open-pipeline drawer fetches on open, never on mount.** One
  `fetchCRMLeads` at `pageSize: OPEN_ROWS_CAP` (500), sorted by cart value
  descending, then paged **client-side** at 25. It is outside the mount budget
  because it costs nothing until someone taps the card. The cap is surfaced, not
  swallowed: when `count > results.length` the drawer says it is showing the N
  largest of M and that the headline total still counts all M — unlike the retail
  dashboard's 3,000-row cap, which truncates silently (see
  `docs/dashboard/context.md`). A failed fetch says the list is missing and that
  the total above came from a different call, rather than rendering as "no open
  carts".

  Order Won was briefly left on the created basis while Revenue Generated moved,
  which put ₹13.58L and ₹47.5L on one screen as two different answers to "what
  did we win". Do not reintroduce that split: if a number in this panel moves
  basis, the whole panel moves, or the stacked bar underneath stops summing to
  its own total.

- **Revenue Generated reads the branch total, not the sum of the verticals.**
  Those are different numbers and the screen showed both: `branchTotal.won` was
  ₹13,44,897 ("Order Won") while the verticals summed to ₹10,08,823 ("Revenue
  Generated"), because `bm_groups` keys on rep phone and the branch total does
  not. Both now read `pipeline.won.value`. The difference has to go somewhere,
  so `revenueSources` (`views/dashboard/utils.ts`) appends a grey
  `No B2B rep on cart` slice for the remainder — on the order basis that slice
  is most of the donut (₹36.6L of ₹47.4L), which is the honest shape of the
  data, not a bug to tune away.

- **The Leaderboard and Targets are still a third number** — they sum the
  `value` field on closed Supabase rows, and will not reconcile with either
  Django figure. Do not "fix" a mismatch by making one read the other; check
  which source the panel is meant to speak for. Targets was compounding this by
  comparing an **all-time** sum against a **monthly** goal, so its percentage
  only ever climbed; `computeTargets` now takes a range and the tab passes the
  current month.

- **The rep roster is one hardcoded list, `components/b2b/models/roster.ts`.**
  It used to be two that disagreed: `B2B_VERTICALS` in `lib/b2b/leads/kam-load.ts`
  (full names + phone numbers, keying the Dashboard's per-vertical stats) and
  `KAMS`/`B2B_REPS`/`REP_TARGETS` in `models/mock-data.ts` (short names, keying
  every dropdown, filter and Targets card). `Jadhav` vs `Krishna Jadhav`,
  `Praful` vs `Prafful Bhati`, and the two HYD reps existed only in the first —
  so they drove revenue on the Dashboard and appeared nowhere on Targets or the
  Leaderboard. Everything now derives from `B2B_ROSTER`.
  Two constraints on editing it:
  - **`name` is a stored value, not a label.** It is what sits in
    `meta_data.kam` and `owner` on existing `b2b_lead` rows, so renaming one
    orphans those rows from the dropdown. `fullName` and `contact` are the
    display/matching attributes; only `contact` may be corrected freely.
  - **`TARGET_REPS` excludes admins, `ASSIGNABLE_REPS` does not.** Krishna
    Bhagavatula is `role: 'Admin'` *and* assignable — he takes work and is
    `DEFAULT_KAM`, but `repUniverse()` filters `B2B_ADMINS` off the Leaderboard
    and he has no Targets card. That asymmetry is deliberate and predates this
    file; it was briefly "fixed" by making him unassignable and reverted the
    same day.

- **A new-record id is `newB2BId(prefix)`, never `` `X-${Date.now()}` ``.**
  `CLI-` and `KAM-` ids are Supabase upsert conflict targets, so two people
  creating a client in the same millisecond silently overwrote one another.
  `models/ids.ts` appends a random suffix.

### View-level decisions worth not re-litigating

- **The rep leaderboard is the only place `inboundOwnerTotals` is rendered**, so
  that tab asks for it and the other three do not. See the owner-totals note
  above for why it cannot be derived instead.
- **The KAM empty-state banner counts every order; the Active Orders chip counts
  the open ones.** Both numbers are named on screen deliberately — that is what
  stops "30 orders exist" reading as a contradiction of a chip saying 4.
- **A failed read is reported, never rendered as "no leads."** A BM would read an
  empty Outreach board as a day with nothing on it. This is the view-level half
  of the `Array.isArray(rows) ? rows : []` landmine.
- **"Assisted at EC" is never auto-filled** from the ticket's branch or assignee.
  A cart's branch is where it was raised; "assisted at" is a claim about who
  helped close it, and inferring one from the other puts a name in a field
  nobody attested to.

## The partner dashboards are a fifth read, and they go through this app

`lib/b2b/partners/` is the only place that talks to Studio Sales, and it does
not talk to it directly: both calls go to `app/api/b2b/partner-push`, which
holds `PARTNER_SYNC_SECRET` server-side and relays. The browser never sees the
secret and never learns the partner app's URL.

| Call | Route | Endpoint behind it |
|---|---|---|
| `fetchPartnerFirms()` | `GET /api/b2b/partner-push` | `GET /api/sync/partners` on Studio Sales |
| `pushPartners(rows)` | `POST /api/b2b/partner-push` | `POST /api/sync/partners` |

Three things about this read in particular:

- **It is one request, not one per client.** The roster comes back for every
  linked firm in a single call, and the Client Database and the Dashboard each
  spend exactly one on it. Anything that needs per-client partner data reads it
  out of that map.
- **Its failure is a fourth state, not an empty map.** `PartnerRoster.loaded`
  is false when the call failed, `linkState` returns `unknown`, and the
  Dashboard tiles read `Unknown`. A partner app that is down must never make
  every client read "not on Studio Sales", which is a sentence somebody would
  act on.
- **It is fire-and-forget beside the main load, deliberately.** The roster is
  fetched after `setClients`/`setClientCount` rather than inside the
  `Promise.all`, so an outage on the partner side cannot take out the tab that
  merely mentions it. The `.catch` logs and sets the unknown state — this is a
  read whose failure IS visible on screen, which is why it is allowed to be
  detached where a write would not be.

Both env vars are server-only and neither is in the Azure workflow file:
`PARTNER_APP_BASE_URL` and `PARTNER_SYNC_SECRET`. The route answers **503
naming the missing one** rather than failing quietly, which is also how you
check from outside whether a deploy picked them up.
