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
