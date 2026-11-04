*Part of `docs/b2b/context.md` — see that file for the module overview.*

## Data layer: why these reads are shaped the way they are

These constraints were previously recorded as inline comments in `lib/b2b/`.
They live here now because the code cannot carry them.

- **The B2B data is no longer on Supabase.** It moved to the FastAPI
  `b2b-backend` (`newdb` Postgres). The one Supabase `b2b_lead` table (one row
  per lead, discriminated by `pipeline`, everything in a `meta_data` jsonb blob)
  became four normalized tables there — `b2b_inbound_lead`, `b2b_outreach_lead`,
  `b2b_client`, `b2b_kam_order` — with the scalars as real columns and only the
  append-only logs (call attempts, notes, meetings, contacts…) left as jsonb.
  **The CRM's mappers are unchanged**: the backend's `b2b_crm` router
  reconstructs the old `{id, pipeline, stage, kylas_lead_id, owner, value,
  meta_data}` wire shape on read and decomposes it on write, so `rowToInbound` /
  `inboundToRow` and friends still see a `B2BLeadRow`. The browser never reaches
  the backend directly (that would be a fifth egress): it goes
  `lib/b2b/data/backend.ts` → `app/api/b2b/[...path]` (`requireCaller` +
  `canUseB2B`) → FastAPI, trusted by `x-sync-key`. The relay originally
  admitted only `admin`/`b2b_sales`, which would have 403'd every `b2b_KAM`,
  `b2b_manager` and `crm.b2b_sales`-slug user; it uses the tab's own rule now. See
  `docs/backends.md`. This also closed a hole: the old `b2b_lead` had an
  `Allow all access` anon RLS policy, so the boards were writable by anyone who
  could load the app — now every read and write is behind `requireCaller`.

- **A `meta_data` key with no column used to vanish on save.** The router
  decomposed `meta_data` into columns and dropped every other key, silently.
  After PR #27 that ate `invalid_reason`, `invalid_note`, `pi_shared_at`,
  `office_location` and `outreach_referral` on inbound and `alt_phone`/`contacts`
  on outreach: the save returned 200 and the fields were blank on reload. Since
  backend migration `0020` each table has an `extra` jsonb; any key that is not a
  column goes there and comes back in `meta_data` on read, a real column winning
  a name clash. **So a new CRM-owned field needs no backend change**, but a key
  must not be renamed casually: the old name's value stays in `extra`, unread.
  `POST /rows/bulk {rows, only_new}` is the bulk write (Outreach's intake);
  `only_new` is `ON CONFLICT DO NOTHING`.

- **One read serves every board.** Each B2B view wants a different pipeline, but
  `fetchAllRows` makes a single `GET /api/b2b/rows` (the backend runs the four
  per-table selects and concatenates), cached 8s, and the views narrow by
  pipeline and date in memory. Keep it one call — do not add a per-pipeline
  endpoint and fetch four times; that is the budget regression this shape exists
  to prevent. (On Supabase this was one paged `select=*`; same contract, new
  source.) `client_id` on a KAM order is a **soft** reference, not a FK — the
  source never enforced it and orphaned orders exist.

- **A failed Kylas request is indistinguishable from a real zero, so owner
  totals cannot be derived.** `fetchB2BInboundLeads` catches internally and
  returns `total: 0`. Deriving the last owner's count by subtracting from the
  board total would therefore let a single 429 move one rep's leads silently
  onto another rep's card. The Leadership Board's Inbound coverage pays one
  call per person (`size=1`, `totalElements` only, checking `ok`) for this
  reason, and caches only the counts it actually got (`leadership.md`). The old
  `fetchInboundOwnerTotals` went with the old board on 2026-10-28.

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
  number.** The Dashboard's pipeline and vertical stats (both deleted 2026-11-03)
  caught internally and fell back to an empty bucket, which rendered as a
  confident ₹0 pipeline until they returned `ok` and the page showed a banner. Same trap as the Kylas `total: 0` note above — a caught error
  behind a typed return is invisible at the call site unless the type says so.
  `fetchB2BInboundLeads` and `fetchInboundBoard` carry the same `ok` since
  2026-10-28; see the Kylas-outage entry in `docs/landmines.md`.

- **`fetchTargets` returns `{store, ok}`, not a bare store.** The catch path
  returns `defaultTargetStore()` — the built-in 120L — which is indistinguishable
  from a team that genuinely set 120L. `saveTargets` likewise returned `void`
  and swallowed its error, so a target edit looked saved and was not; it now
  returns the message and Set targets (Leadership Board) renders it.

- **Enquiry-id matching is case-insensitive on both sides, but the id sent to
  the backend keeps its original case** so the indexed `__in` lookup hits
  exactly. `wireEnqId` preserves case for the wire; `normalizeEnqId` uppercases
  for local comparison.

- **Chart colours are assigned on the FULL list and travel with the row.** The
  donut drops zero-value sources and the legend does not, so colouring by
  position in either list shifts every source after a ₹0 one — the legend then
  names the wrong slice (HYD's revenue once read as Outreach's). `revenueBySource`
  carries a `color` per row and both the `<Cell>` and the legend swatch read it.

- **The Overview reads no stats any more (2026-11-03).** The user removed the
  "Orders on the B2B branch" panel, with its period and basis toggles, status
  tiles, Open carts drawer and ledger route, because Direct is now every order on
  the branch (`overview.md` §Four revenue channels). `fetchVerticalStats`,
  `fetchB2BPipelineStats` and `loadRange` went with it, which took two or three
  Django calls off every open.

- **Order date and booking branch always travel together.** On `/crm/leads/`,
  `order_from/to` filters on `estimate.order_placed_time`, and it needs
  `branch_basis=estimate` beside it, because Django's `branch` filter otherwise
  keys on the **cart owner's** branch. That is a different population: in Sept
  2026, 49 of the 82 orders booked at B2B sat on carts owned by Gachibowli, HQ,
  JP Nagar, Whitefield or HSR staff. Filtering by order date alone moved the
  month from ₹13.44L to only ₹14.10L; adding the estimate branch moved it to
  ₹47.36L. The revenue reads (`lib/server/b2b-revenue.ts`) send both.

  Order Won was briefly left on the created basis while Revenue Generated moved,
  which put ₹13.58L and ₹47.5L on one screen as two different answers to "what
  did we win". Do not reintroduce that split: if a number in this panel moves
  basis, the whole panel moves, or the stacked bar underneath stops summing to
  its own total.

- **Revenue Generated reads the branch total, not the sum of the verticals.**
  Those are different numbers and the screen showed both: `branchTotal.won` was
  ₹13,44,897 ("Order Won") while the verticals summed to ₹10,08,823 ("Revenue
  Generated"), because `bm_groups` keys on rep phone and the branch total does
  not. The Orders section reads `pipeline.won.value`. The old grey `No B2B rep on
  cart` slice went with the donut on 2026-10-31. Since 2026-11-03 every placed
  order on the branch is Direct unless the client was referred (`overview.md`
  §Four revenue channels).

- **The B2B target is the sum of every team member's revenue target**
  (`b2bTargetL`, `leadership.md` §Set targets), not a typed 120L. Achieved on
  the Overview is the three-channel total, so achieved and target come from
  different places by design.

- **The rep roster is one hardcoded list, `components/b2b/models/roster.ts`.**
  It used to be two that disagreed: `B2B_VERTICALS` in `lib/b2b/leads/kam-load.ts`
  (full names + phone numbers, keying the Dashboard's per-vertical stats) and
  `KAMS`/`B2B_REPS` in `models/mock-data.ts` (short names, keying
  every dropdown and filter). **Since 2026-10-31 no picker or filter reads it:**
  `useB2BReps` gives the live team, with the roster only as the fallback when the
  table cannot be read, and `repNames` adds stored names that match nobody live,
  so a firm held by someone off the team still filters. `KAMS` was every assignable
  rep, not the KAMs, and is deleted with `DEFAULT_KAM` and `ASSIGNABLE_REPS`.
  Compare rep names with `sameRep`, never `===`: stored rows say "Jadhav" and the
  team says "Krishna Jadhav". Targets no longer reads the roster (`leadership.md`). `Jadhav` vs `Krishna Jadhav`,
  `Praful` vs `Prafful Bhati`, and the two HYD reps existed only in the first —
  so they drove revenue on the Dashboard and appeared nowhere on Targets or the
  old leaderboard. Everything now derives from `B2B_ROSTER`.
  Two constraints on editing it:
  - **`name` is a stored value, not a label.** It is what sits in
    `meta_data.kam` and `owner` on existing `b2b_lead` rows, so renaming one
    orphans those rows from the dropdown. `fullName` and `contact` are the
    display/matching attributes; only `contact` may be corrected freely.
  - **A `b2b_KAM` role in Django does not put anyone on the B2B tab.** The role
    only grants the tab; every KAM list and dropdown reads this
    file. Sai Suresh (9187953228) had `b2b_KAM` since Aug 2026 and appeared
    nowhere until he was added here (Oct 2026). A new B2B hire needs a roster
    row as well as the role.
  - **Inbound ownership no longer reads this file** (2026-10-28). It reads the
    `b2b_team_member` table, which managers edit under B2B Sales → Team; see
    `inbound.md` §Who owns a lead. Nor does the Leadership Board, which reads
    the team table and falls back to names in the data (`leadership.md`). KAM
    lists still read `B2B_ROSTER` until the redesign retires it.

- **A new-record id is `newB2BId(prefix)`, never `` `X-${Date.now()}` ``.**
  `CLI-` and `KAM-` ids are Supabase upsert conflict targets, so two people
  creating a client in the same millisecond silently overwrote one another.
  `models/ids.ts` appends a random suffix.

### Requirement history: one diff, three pipelines (2026-10-29)

The user asked that a client's requirement can change at any stage (Inbound,
Outreach, KAM) and that every earlier version stays readable.
`models/requirement` `withRequirementHistory(before, after, by, at)` appends
the old text to `requirement_history` (`{text, replacedAt, replacedBy}[]`)
whenever a non-empty requirement changes. It is applied at the write, diffed
against the last saved record, not wired to a button:

- **Outreach:** inside `withJourney`, which every Outreach save already goes
  through. It also logs a `requirement-changed` journey event.
- **Inbound:** the drawer keeps a `saved` ref, and both the Save button and the
  call log go through it. The call log writes the whole draft, so a requirement
  edited and then a call logged would otherwise skip the history.
- **KAM:** per order, in the order modal's save. A new order has none. The
  modal's `kam` prop is the KAM a new order defaults to, not always the editor, so the entry takes `actor`. The first
  browser run recorded a roster name instead of the KAM who made the edit.

Filling an empty requirement is not a change, clearing one keeps the old text,
and an entry equal to the last one is skipped, so a stale baseline cannot
duplicate a version. Each editor shows "Previous requirements (n)", newest
first (`ui/requirement-history.tsx`). Rows written before this have no history,
so their first change starts it. `requirement_history` is a new meta key, so
it is stored in the backend's `extra` and persists only once migration 0020 is
live. Checked by compiling the helper and running the A→B→A→B, clear,
whitespace and stale-baseline cases, then in the sandbox browser: two edits to
a KAM order read "Previous requirements (2)", naming the KAM who made them.

### View-level decisions worth not re-litigating

- **The KAM empty-state banner counts every order; the Open orders tile counts
  the open ones.** Both numbers are named on screen deliberately — that is what
  stops "30 orders exist" reading as a contradiction of a tile saying 4.
- **A failed read is reported, never rendered as "no leads."** A BM would read an
  empty Outreach board as a day with nothing on it. This is the view-level half
  of the `Array.isArray(rows) ? rows : []` landmine.
- **"Assisted at EC" is never auto-filled** from the ticket's branch or assignee.
  A cart's branch is where it was raised; "assisted at" is a claim about who
  helped close it, and inferring one from the other puts a name in a field
  nobody attested to.
