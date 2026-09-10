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

- **There are two revenue numbers in this module and they are not the same
  number.** The Dashboard's headline revenue is Django's `fetchVerticalStats`,
  month-scoped and grouped by rep phone. The Leaderboard and Targets sum the
  `value` field on closed Supabase rows. They will not reconcile, and nothing
  labels which is which on screen. Until one wins, do not "fix" a mismatch by
  making one read the other — check which source the panel is meant to speak
  for. Targets was compounding this by comparing an **all-time** sum against a
  **monthly** goal, so its percentage only ever climbed; `computeTargets` now
  takes a range and the tab passes the current month.

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
