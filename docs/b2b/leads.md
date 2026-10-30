*Part of `docs/b2b/context.md` — see that file for the module overview.*

## The Leads tab: one row per lead, and three states in one column

`components/b2b/views/leads/index.tsx` + `fetchUnifiedLeads` implement
`Leads_Tab_PRD.docx` v1.0. The tab **captures nothing** — every row originates
in Inbound or Outreach — with one exception besides assignment (below): "Assisted at EC", which the PRD
puts on this screen and which belongs to neither source form. It is written back
to whichever source row the lead came from (`outreach.ecName` /
`inbound.placedUnder.ecName`); this tab has no store of its own.

**EC is an Experience Centre, not an End Consumer.** The PRD asks for two
dropdowns; `EcPicker` binds them to `fetchBranchList()` (through
`apptBranchesFromCrm`, which drops HQ/warehouse and normalises the CRM's
"Yelankha") and `fetchAvailableBMs` called with the **Django names** that EC
came from, not the EC label. Until 2026-09-25 it sent the label, and Django only
matches its own upper-case names, so every EC listed no BMs at all. It follows
this file's roster rules:
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

### Assigning from this tab (2026-10-31)

The user wants one shape on Leads and Client Database: assign straight to a
person, or select rows and round-robin them over a chosen set of people.
Managers get the checkbox column and the shared `AssignBar`, plus an Unassigned
filter and an EC B2B Referral source filter. `useLeadAssign` holds the rules.

- **The bar picks the team first, the same on both tabs.** A lead stays on its own
  side: Outreach to an Outreach BM, Inbound to an Inbound member. A team is enabled
  only if the selection holds leads it can take, and KAM is off here. In a mixed
  selection the chosen team takes its own leads and the note counts the rest.
  Moving a record across teams has no data path in this bar: Inbound to Outreach
  is Send to Outreach, Outreach to KAM is the handover.
- **A record with no owner may start mid-journey (the user, 2026-10-31), but only
  where a path exists.** Enabled today: an unowned Outreach lead to Outreach, and an
  unowned firm to KAM. Left disabled: an Inbound lead straight to Outreach (it stays
  in Inbound's queue, so the rotation can still hand it to a rep, it would credit
  Inbound, and a rejection marks it Lost), an Outreach lead straight to KAM, and a
  firm to Outreach. A lead the team already knows can be entered in Outreach's
  + New lead as Unassigned. **The user ruled the first one unnecessary
  (2026-10-31): keep it greyed out and do not propose it again.**
- **Bulk takes only open leads with no owner (2026-10-31).** For Inbound that is no
  owner, or still with the intake owner (`INBOUND_INTAKE_KYLAS_ID`). A lead that
  has an owner is moved one at a time: One person takes it only when it is the
  single selected row. Closed and lost are always left alone, and the note says
  how many stayed.
- **Outreach** goes through `assignLead` and `withJourney` into one `/rows/bulk`,
  so the BM accepts or rejects, as in the pool.
- **Inbound changes the Kylas owner, one call per lead.** `reassign-many` on
  `/api/b2b/inbound/assign` takes at most `INBOUND_ROTATION_BATCH` (25), reads the
  team once, and reports `moved` and `failed` separately, so a partial failure
  shows. CRM-added leads have no Kylas owner and are saved with `upsertInboundLeads`.
- Load for an Inbound round robin counts only the open leads on this tab's loaded
  set, because Kylas gives no per-owner total in that response.

**No export (2026-10-29).** The user removed the CSV/Excel export from this tab
for every role, admins included, as a security decision. Do not restore it
behind a role check.
