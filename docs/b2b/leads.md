*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The Leads tab: one row per lead, and three states in one column

`components/b2b/views/leads/index.tsx` + `fetchUnifiedLeads` implement
`Leads_Tab_PRD.docx` v1.0. The tab **captures nothing** — every row originates
in Inbound or Outreach — with one exception: "Assisted at EC", which the PRD
puts on this screen and which belongs to neither source form. It is written back
to whichever source row the lead came from (`outreach.ecName` /
`inbound.placedUnder.ecName`); this tab has no store of its own.

**EC is an Experience Centre, not an End Consumer.** The PRD asks for two
dropdowns; `EcPicker` binds them to `fetchBranchList()` (through
`apptBranchesFromCrm`, which drops HQ/warehouse and normalises the CRM's
"Yelankha") and `fetchAvailableBMs([ec])`. It follows this file's roster rules:
a non-array response throws, the last good roster survives a later failure, a
stored value not in the roster is kept as an extra option, and a failed load is
reported as *unreadable* rather than rendered as an empty dropdown.

Nothing auto-fills those two from the matched deal ticket. A cart's `branch` is
where it was raised and `assignedTo` is who owns it; "assisted at" is a claim
about who helped close it, and inferring one from the other puts a name in a
field nobody attested to.

Three PRD open questions are resolved in `fetchUnifiedLeads`, in code rather
than in JSX:

- **Lost leads stay listed** (open question #1). Status is the PRD's binary
  Closed / Yet to Close exactly as written, with a separate `lost` flag rendered
  beside it and filterable. Dropping them hides the outcome the business most
  wants to count; folding them into "Yet to Close" claims a dead lead is still
  being worked.
- **Expected date of closure has THREE states, not two.** Outreach has the
  field; Inbound does not and must not — Kylas `expectedClosureOn` is
  auto-stamped junk and is deliberately unmapped (see above). So the column
  renders a date, "not set", or `n/a`, carried by `hasExpectedClosureField`.
  Collapsing the third into the second reads as the Inbound team failing to fill
  a field that does not exist.
- **A half-loaded list says so.** Each side is caught separately into
  `failed: LeadSource[]` and the tab prints which one did not load. A Leads tab
  quietly showing only the Outreach half looks exactly like a CRM with no
  inbound leads.

Inbound contributes `fetchInboundBoard()` page 0 plus the whole DB overlay — the
same set the Inbound tab shows — so the footer states how many unactioned Kylas
leads are NOT in the list rather than implying the count is everything.
