'use client';

import { ReactNode } from 'react';
import { OutreachLead } from '../../models/mock-data';
import { EnrichmentGap, WaitlistSignup } from '../../models/outreach';
import { HANDOVER_STATE_COLOR, HANDOVER_STATE_LABEL, handoverState } from '../../models/outreach/handover';
import { FollowUpChip, Pill } from '../../ui/inbound-chips';
import { Hint } from '../../ui/info-tip';
import { OutreachLeadTypeChip, OutreachStatusBadge, WaitlistChip } from '../../ui/outreach-chips';
import { OutreachTab, OutreachTabDef } from './types';

export function OutreachHeader({ draft, gaps, today, waitlist, waitlistError, nowMs, people, tabs, tab, onTab, onClose }: {
  draft: OutreachLead;
  gaps: EnrichmentGap[];
  today: string;
  waitlist: WaitlistSignup | null | undefined;
  waitlistError: string | null;
  nowMs: number;
  people: ReactNode;
  tabs: OutreachTabDef[];
  tab: OutreachTab;
  onTab: (t: OutreachTab) => void;
  onClose: () => void;
}) {
  const hs = handoverState(draft, nowMs);
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-gray-900 truncate">
              {draft.company || <span className="text-gray-400">Not named yet</span>}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {draft.phone
                ? <a href={`tel:${draft.phone}`} className="text-[12px] font-mono text-gray-600 hover:text-[#0F766E]">{draft.phone}</a>
                : <span className="text-[12px] text-gray-400">No phone</span>}
              <OutreachStatusBadge s={draft.status} />
              <OutreachLeadTypeChip t={draft.leadType} />
              {(draft.status === 'Follow up' || draft.status === 'PI Shared') && (
                <FollowUpChip date={draft.followUpDate} today={today} />
              )}
              {hs !== 'not-converted' && <Pill color={HANDOVER_STATE_COLOR[hs]}>{HANDOVER_STATE_LABEL[hs]}</Pill>}
              <WaitlistChip w={waitlist} error={waitlistError} />
              {draft.enqId && <span className="text-[11px] font-mono text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">{draft.enqId}</span>}
              {gaps.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <button onClick={() => onTab('client')} className="text-[11px] font-medium text-amber-700 hover:underline">
                    {`${gaps.length} detail${gaps.length === 1 ? '' : 's'} missing`}
                  </button>
                  <Hint text={`Still empty: ${gaps.map((g) => g.label).join(', ')}. These do not block a save.`} />
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
        </div>
        <div className="mt-2.5">{people}</div>
      </div>
      <nav className="flex gap-1 px-3 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={`relative px-2.5 pb-2 pt-1 text-[12.5px] font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {t.label}
            {t.badge && <span className={`ml-1 tabular-nums text-[11px] ${t.warn ? 'text-amber-600' : 'text-gray-400'}`}>{t.badge}</span>}
            {tab === t.key && <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[#0F766E]" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
