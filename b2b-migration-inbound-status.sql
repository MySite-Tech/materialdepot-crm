-- ── Inbound CRM Module — collapse nine board stages into the PRD's four ──────
--
-- Run in the CRM's own project (olkkioacgccgsjjlmbhc) > SQL Editor.
-- Implements `Inbound_CRM_Module_PRD.docx` v1.0 §3.4.
--
-- THIS MIGRATION IS OPTIONAL. `normalizeStatus` / `decomposeLegacyStage` in
-- `components/b2b/inboundModel.ts` apply the same mapping on every read, so the
-- board is correct whether or not anyone runs this. That is deliberate — this
-- repo has twice shipped a migration nobody ran. Running it just makes the
-- stored data match what the UI already shows, and lets the read path's legacy
-- branch eventually be deleted.
--
-- Verified against all 151 live inbound rows on 2026-09-08: every stage present
-- is covered below and nothing falls through.
--
--   stage                rows   becomes
--   Followup Required      81   status 'Follow up'
--   Hyderabad              40   status 'Follow up', location 'Hyderabad'
--   RNR                    13   status 'Follow up', seeded call attempt 1 = RNR
--   Quote                   6   status 'Follow up'   (no PI number was raised)
--   PI Shared               5   unchanged
--   Lost                    3   unchanged
--   Enquiry Invalid         2   status 'Lost', lost_reason 'Enquiry invalid'
--   New                     1   unchanged
--
-- Two of the nine were never statuses at all:
--   * `Hyderabad` was a location. Confirmed against Kylas `zipcode`: 11 of 13
--     sampled Hyderabad rows are 50xxxx (Telangana) while every Followup
--     Required row is 56xxxx (Karnataka).
--   * `RNR` was a call outcome, which PRD §3.2 models as attempt 1-4 →
--     Connected | RNR. The lead itself is still awaiting follow-up.
--
-- Nothing is deleted: each retired stage is written into the field that actually
-- meant it, and `meta_data.legacy_stage` keeps the original string so this is
-- reversible.

begin;

-- Keep the original stage on every row this touches, so the mapping can be
-- audited or undone.
update b2b_lead
set meta_data = meta_data || jsonb_build_object('legacy_stage', stage)
where pipeline = 'inbound'
  and stage in ('Hyderabad', 'RNR', 'Followup Required', 'Quote', 'Enquiry Invalid')
  and not (meta_data ? 'legacy_stage');

-- Hyderabad → a location, not a stage. Only set `location` when the team has
-- not already chosen one.
update b2b_lead
set meta_data = meta_data || jsonb_build_object(
      'location',
      coalesce(nullif(meta_data->>'location', ''), 'Hyderabad')
    ),
    stage = 'Follow up'
where pipeline = 'inbound' and stage = 'Hyderabad';

-- RNR → attempt 1 logged as RNR. Seeded from the row's own timestamp because
-- the old column recorded that a call rang out but never when; claiming zero
-- calls were made would be worse than an approximate date.
update b2b_lead
set meta_data = meta_data || jsonb_build_object(
      'call_attempts',
      jsonb_build_array(jsonb_build_object(
        'n', 1,
        'outcome', 'RNR',
        'at', coalesce(to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'), created_at || 'T00:00:00Z'),
        'note', 'Carried over from the retired RNR column'
      ))
    ),
    stage = 'Follow up'
where pipeline = 'inbound'
  and stage = 'RNR'
  and coalesce(jsonb_array_length(
        case when jsonb_typeof(meta_data->'call_attempts') = 'array'
             then meta_data->'call_attempts' else '[]'::jsonb end), 0) = 0;

-- Any RNR row that somehow already had attempts keeps them and just moves.
update b2b_lead set stage = 'Follow up'
where pipeline = 'inbound' and stage = 'RNR';

-- Enquiry Invalid → Lost, with the reason that says so.
update b2b_lead
set meta_data = meta_data || jsonb_build_object(
      'lost_reason',
      coalesce(nullif(meta_data->>'lost_reason', ''), 'Enquiry invalid')
    ),
    stage = 'Lost'
where pipeline = 'inbound' and stage = 'Enquiry Invalid';

-- Followup Required / Quote → Follow up. Neither raised a PI number, so
-- neither can be PI Shared.
update b2b_lead set stage = 'Follow up'
where pipeline = 'inbound' and stage in ('Followup Required', 'Quote');

-- ── Junk expected-closure dates ──────────────────────────────────────────────
-- `meta_data.expected_closure` was mirrored from Kylas `expectedClosureOn`,
-- which is auto-stamped a few minutes after the lead is created (median 14
-- minutes across 100 sampled leads; 45 of them inside 10 minutes). It is not an
-- expected closure date, the PRD defines no such field for inbound, and while
-- it was mapped in, setting it auto-flipped a lead's status to Followup
-- Required — which is how 81 rows reached that stage with no follow-up date on
-- a single one of them. The read path no longer maps it; this clears the stored
-- copy so nothing downstream picks it up again.
update b2b_lead
set meta_data = (meta_data - 'expected_closure') || jsonb_build_object(
      'legacy_expected_closure', meta_data->>'expected_closure'
    )
where pipeline = 'inbound'
  and coalesce(meta_data->>'expected_closure', '') <> '';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect only: New, Follow up, PI Shared, Closed, Lost.
--
--   select stage, count(*), count(meta_data->>'location') as with_location
--   from b2b_lead where pipeline = 'inbound' group by stage order by 2 desc;
--
-- Expect 40 rows, all Hyderabad:
--
--   select meta_data->>'legacy_stage', meta_data->>'location', count(*)
--   from b2b_lead where pipeline = 'inbound' and meta_data ? 'legacy_stage'
--   group by 1, 2 order by 3 desc;
