'use client';

import { ENRICHMENT_FIELD_COUNT } from '../../constants/inbound';
import { InboundLead } from '../../models/mock-data';
import { EnrichmentGap } from '../../types/inbound';
import { FollowUpChip, LeadTypeChip, PriorityChip, StatusBadge } from '../../ui/inbound-chips';
import { nameIsJustThePhone } from '../../utils/inbound';

export function InboundDrawerHeader({ draft, gaps, onClose, today }: {
  draft: InboundLead;
  gaps: EnrichmentGap[];
  onClose: () => void;
  today: string;
}) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-gray-900 truncate">
            {draft.companyName?.trim()
              || (nameIsJustThePhone(draft)
                ? <span className="text-gray-400 font-semibold italic">Not named yet</span>
                : draft.company)}
          </h2>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[12px] font-mono text-gray-500">{draft.phone || '—'}</span>
            <span className="text-gray-300">·</span>
            <StatusBadge s={draft.stage} />
            <PriorityChip p={draft.priority} />
            <LeadTypeChip t={draft.leadType} />
            {(draft.stage === 'Follow up' || draft.stage === 'PI Shared') && (
              <FollowUpChip date={draft.followUpDate} today={today} />
            )}
          </div>
          {nameIsJustThePhone(draft) && (
            <p className="text-[11px] text-amber-700 mt-1.5">
              Kylas has no company name for this lead — it ships the phone number in the name
              field. Fill <strong>Client company name</strong> below.
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
      </div>
      {gaps.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-2.5">
          <span className="font-semibold text-amber-700">{gaps.length} of {ENRICHMENT_FIELD_COUNT} enrichment fields empty</span>
          {' — '}{gaps.map((g) => g.label).join(', ')}. These do not block a save.
        </p>
      )}
    </div>
  );
}
