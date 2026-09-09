*Part of `docs/b2b/context.md` — see that file for the module overview.*

## B2B Outreach: the field half, and why it is not "Outbound" any more

`components/b2b/models/outreach.ts` implements `B2B_Outreach_Module_PRD.docx`
v1.0 (KK) and is the counterpart of `components/b2b/models/inbound/` — the ONE place that
answers "where does this field live?" for an outreach lead. Only two systems
hold one, not three: `b2b_lead.meta_data` for everything the BM types, and the
Django deal tickets for the money. There is no Kylas leg, because nobody
qualified the lead before the BM walked into the room.

**The module is called Outreach everywhere a human reads it** (nav, headings,
the Leads tab's Source column, `B2B_VERTICALS`, the Leaderboard column) and
`'outbound'` everywhere a machine does. `b2b_lead.pipeline` is still
`'outbound'`: it is a stored enum whose allowed values are not tracked in this
repo, and this file already records that DB CHECK constraints here have to be
verified live. Renaming a column value to match a document's wording is not
worth a write that starts failing in production.

`b2b_lead` held **zero outreach rows** when this shipped (verified 2026-09-08:
181 rows, all `inbound` or `kam`), so the six-status vocabulary changed with no
data to migrate — `In Progress` → `Follow up`, `Samples/Catalogues Shared` →
`Quote Share`. `normalizeOutreachStatus` still decomposes the old two on READ,
for the same reason `normalizeStatus` does on the inbound side.

### The old board counted a typed guess as revenue

`OutboundLead` had a single `value` the BM typed on the create form
("Monthly order value"), and `analytics.ts` summed exactly that field as
realised revenue for every `Closed` lead. That is the bug the Inbound rollout
fixed, present again on the other board. Now: `expectedOrderValue` is the BM's
estimate and is read by nothing but the §6 Quote Shared tile (labelled as an
estimate on screen); `orderValue` comes from the deal ticket via `lookupEnqId`;
and `value` — the column analytics reads — is `orderValue || 0` in both the
mapper and every writer. **Do not put a typed figure into `value`.**

`outboundToRow` also dropped `expected_closure` on every write while
`rowToOutbound` read it, so an Expected date of closure typed into the drawer
vanished on save — and it is a column the Leads tab PRD asks for.
`OUTREACH_META` is now one declaration driving both directions, so a field
cannot exist on one side only.

### Gates: two hard, everything else asked for

`outreachGateErrors` blocks a next follow-up date on `Follow up` / `PI Shared`
and a lost reason on `Lost`. Two deliberate softenings, both because the PRD
does not name them:

- **Time.** The PRD says "date & time". Only the DATE blocks, so this board and
  the Inbound board gate identically — the same reps work both.
- **Enq ID on PI Shared.** The Inbound PRD names it required and hard-gates it;
  this one only says the value is auto-fetched. Soft here, prompted loudly:
  without it the fetch cannot run and the value stays blank, which is
  recoverable. `outreachStatusPrompts` carries these.

`MoveModal` opens for `Quote Share`, `PI Shared` and `Closed` too, even though
none of them has a hard gate — those are the three moves with something worth
collecting, and a silent move is how a status ends up with none of its fields.

### Meetings are a four-slot loop, not a visit counter

The old board had `visitCount: number`. The PRD wants meetings 1–4, each
`Completed` or `Postponed`, with location (area + office) and notes captured
**once a meeting is Completed** — the notes box only appears then. `Scheduled`
is a third state the PRD does not name and cannot be avoided: a booked meeting
is neither outcome, and storing it as either reports a meeting that never
happened (the same reasoning as Inbound's `New`). `meetingsExhausted` is the
diagram's "Meeting 4: Postponed" branch and only *offers* Lost or a long-term
park — it never decides.

### One KAM rotation, not two

`fetchKamLoad` counts closed leads across **both** lead pipelines.
`fetchInboundKamLoad` is now an alias of it. The Outreach PRD says its handoff
is "consistent with the Inbound module's handoff logic" and its open question #2
asks whether the pools are shared; two separate counts would each pick "the
least loaded KAM" by their own reckoning and both land on the same person, so a
shared count is the only reading under which "consistent" is true.
