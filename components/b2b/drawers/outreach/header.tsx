'use client';

import { OutreachLead } from '../../models/mockData';
import { OUTREACH_ENRICHMENT_FIELD_COUNT } from '../../models/outreachModel';
import { EnrichmentGap } from '../../models/outreachModel';
import { FollowUpChip } from '../../ui/inboundChips';
import { OutreachLeadTypeChip, OutreachStatusBadge } from '../../ui/outreachChips';

export function OutreachHeader({ draft, gaps, onClose, today }: {
  draft: OutreachLead;
  gaps: EnrichmentGap[];
  onClose: () => void;
  today: string;
}) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-gray-900 truncate">
            {draft.company || <span className="text-gray-400 font-semibold italic">Unnamed company</span>}
          </h2>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[12px] text-gray-500">{draft.contactPerson || '—'}</span>
            {draft.designation && <span className="text-[12px] text-gray-400">· {draft.designation}</span>}
            <span className="text-gray-300">·</span>
            <OutreachStatusBadge s={draft.status} />
            <OutreachLeadTypeChip t={draft.leadType} />
            {(draft.status === 'Follow up' || draft.status === 'PI Shared') && (
              <FollowUpChip date={draft.followUpDate} today={today} />
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
      </div>
      {gaps.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-2.5">
          <span className="font-semibold text-amber-700">{gaps.length} of {OUTREACH_ENRICHMENT_FIELD_COUNT} fields still empty</span>
          {' — '}{gaps.map((g) => g.label).join(', ')}. These do not block a save.
        </p>
      )}
    </div>
  );
}
