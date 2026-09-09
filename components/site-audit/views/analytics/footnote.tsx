'use client';

import { NPS_HOUSE_NOTE } from '../../shared/format';

export function AnalyticsFootnote({  }: {

}) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[11px] text-gray-500 leading-relaxed">
      <b>Job Card &amp; Signature %:</b> Counts the client signature on the job card itself (audit: <code>audit_ticked.sign</code>, install:
      <code>subjobs[].jobcard.sign</code>). It used to infer this from &quot;a rating exists&quot;, which held only while the field app wrote the rating at
      the moment of signing — that stopped on 24 Aug 2026, when review scores moved to a Category Ops call made the day after.
      <br />
      <b>Arrival on time:</b> Filtered by selected date range, floor 2 Jul 2026 (when tracking began). &gt;3 min late = delayed. N/T = no tracked data in
      range.
      <br />
      <b>Delivery delay (log-based):</b> Any log entry mentioning "delay". <b>Confirmed delayed (new):</b> compares original_delivery_date vs current
      delivery_date — set for orders created from 2 Jul 2026.
      <br />
      <b>Multi-attempt counting:</b> Each subjob date = one attempt. Rescheduled orders appear once per scheduled date found in the date range (log
      parsing used for post-July 2026 data).
      <br />
      <b>NPS &amp; ratings:</b> Attached to each completed job by its order id — audit is unambiguous (one order, one score, latest write wins); install
      matches the rated installer&apos;s email first, then nearest completion date, since a rating&apos;s order id names the parent order and not which of
      its sub-jobs was reviewed. So the score count is always a subset of that section&apos;s completed total, and a score counts in the period of the job
      it describes, not the period the Category Ops call happened in. The last few days of any range will show fewer scores than jobs — those D+1 calls
      have not been made yet. With a city selected, scores follow their order&apos;s city (the ratings table has no city of its own).
      <br />
      <b>NPS:</b> {NPS_HOUSE_NOTE} Range −100 to +100. Not comparable with the store-visit NPS on the <b>NPS</b> tab, which asks a different question of
      footfall customers on textbook bands.
    </div>
  );
}
