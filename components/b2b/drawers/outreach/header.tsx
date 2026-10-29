'use client';

import { OutreachLead } from '../../models/mock-data';
import { OUTREACH_ENRICHMENT_FIELD_COUNT } from '../../models/outreach';
import { EnrichmentGap } from '../../models/outreach';
import { FollowUpChip, Pill } from '../../ui/inbound-chips';
import { STUDIO_WAITLIST_URL, WaitlistSignup } from '../../models/outreach';
import { HANDOVER_STATE_COLOR, HANDOVER_STATE_LABEL, handoverState } from '../../models/outreach/handover';
import { OutreachLeadTypeChip, OutreachStatusBadge } from '../../ui/outreach-chips';

function WaitlistChip({ w, error }: { w: WaitlistSignup | null | undefined; error: string | null }) {
  if (w === undefined) return <span title={error || undefined}><Pill color="#9CA3AF">Waitlist unknown</Pill></span>;
  if (w) return <span title={`Joined ${w.createdAt.slice(0, 10)} as ${w.firmName} · Studio Space status ${w.status}`}><Pill color="#8B5CF6">On Studio Space waitlist</Pill></span>;
  return (
    <a href={STUDIO_WAITLIST_URL} target="_blank" rel="noreferrer" title="No waitlist sign-up on this mobile. Share this link with them.">
      <Pill color="#F59E0B">Not on waitlist</Pill>
    </a>
  );
}

export function OutreachHeader({ draft, gaps, onClose, today, waitlist, waitlistError, nowMs }: {
  draft: OutreachLead;
  gaps: EnrichmentGap[];
  onClose: () => void;
  today: string;
  waitlist: WaitlistSignup | null | undefined;
  waitlistError: string | null;
  nowMs: number;
}) {
  const hs = handoverState(draft, nowMs);
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
            {hs !== 'not-converted' && <Pill color={HANDOVER_STATE_COLOR[hs]}>{HANDOVER_STATE_LABEL[hs]}</Pill>}
            <WaitlistChip w={waitlist} error={waitlistError} />
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            {[draft.source ? `Source: ${draft.source}` : 'Source not set', draft.intake?.inboundOwner ? `from Inbound (${draft.intake.inboundOwner})` : '', draft.bm ? `BM ${draft.bm}` : 'No BM yet — assign it from Assignments']
              .filter(Boolean).join(' · ')}
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
