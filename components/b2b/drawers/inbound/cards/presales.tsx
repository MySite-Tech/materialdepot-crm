'use client';

import { InboundLead } from '../../../models/mock-data';
import { Field, ReadValue, SectionCard, fmtLeadDateTime } from '../../../ui/inbound-chips';

export function InboundPresalesCard({ detailFailed, detailLoading, draft, presalesTypeUnmapped }: {
  detailFailed: boolean;
  detailLoading: boolean;
  draft: InboundLead;
  presalesTypeUnmapped: boolean;
}) {
  return (
    <SectionCard
      title="From Presales"
      owner="kylas"
      subtitle="Read-only · overwritten on every sync"
      right={detailLoading
        ? <span className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
        : detailFailed
          ? <span className="text-[10px] font-semibold text-red-500">Kylas unreachable</span>
          : null}
    >
      {detailFailed && (
        <p className="text-[11px] text-red-600 mb-3 leading-snug">
          Kylas did not answer, so this block shows the last stored snapshot rather than live
          values. It is not evidence Presales left these blank.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Contact number"><ReadValue v={draft.phone} /></Field>
        <Field label="Contact name"><ReadValue v={draft.contactName} /></Field>
        <Field label="Assigned to"><ReadValue v={draft.owner} /></Field>
        <Field label="Lead date & time" className="col-span-2 sm:col-span-1">
          <ReadValue v={fmtLeadDateTime(draft.leadCreatedAt)} />
        </Field>
        <Field label="Qualified as"><ReadValue v={draft.qualificationTag} /></Field>
        <Field label="Qualified by"><ReadValue v={draft.presalesOwner} /></Field>
        <Field label="Lead summary" className="col-span-2">
          <ReadValue v={draft.leadSummary} />
        </Field>
        <Field label="Urgency"><ReadValue v={draft.urgency} /></Field>
        <Field label="Pincode" hint={draft.pincode ? 'Sets the default Location' : undefined}>
          <ReadValue v={draft.pincode} />
        </Field>
        <Field
          label="Client type (Presales)"
          hint={presalesTypeUnmapped ? 'No exact match in the PRD list — pick one yourself below' : undefined}
        >
          <ReadValue v={draft.presalesClientType} />
        </Field>
        <Field label="Missed calls (Presales)">
          <ReadValue v={draft.presalesMissedCalls} />
        </Field>
        <Field label="Source"><ReadValue v={draft.source} /></Field>
      </div>
    </SectionCard>
  );
}
