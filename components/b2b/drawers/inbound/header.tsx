'use client';

import { ReactNode } from 'react';
import { isOpenStatus } from '../../constants/inbound';
import { InboundLead } from '../../models/mock-data';
import { EnrichmentGap } from '../../types/inbound';
import { DrawerTab } from '../../types/inbound-drawer';
import { FollowUpChip, LeadTypeChip, PriorityChip, StatusBadge } from '../../ui/inbound-chips';
import { nameIsJustThePhone } from '../../utils/inbound';

export interface TabDef { key: DrawerTab; label: string; badge?: string; warn?: boolean }

export function InboundDrawerHeader({ draft, gaps, today, people, tabs, tab, onTab, onClose }: {
  draft: InboundLead;
  gaps: EnrichmentGap[];
  today: string;
  people: ReactNode;
  tabs: TabDef[];
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  onClose: () => void;
}) {
  const unnamed = !draft.companyName?.trim() && nameIsJustThePhone(draft);
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-gray-900 truncate">
              {draft.companyName?.trim() || (unnamed ? <span className="text-gray-400">Not named yet</span> : draft.company)}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {draft.phone
                ? <a href={`tel:${draft.phone}`} className="text-[12px] font-mono text-gray-600 hover:text-[#0F766E]">{draft.phone}</a>
                : <span className="text-[12px] text-gray-400">No phone</span>}
              <StatusBadge s={draft.stage} />
              <PriorityChip p={draft.priority} />
              <LeadTypeChip t={draft.leadType} />
              {isOpenStatus(draft.stage) && !!draft.followUpDate && <FollowUpChip date={draft.followUpDate} today={today} />}
              {draft.enqId && <span className="text-[11px] font-mono text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">{draft.enqId}</span>}
              {gaps.length > 0 && (
                <button onClick={() => onTab('client')} className="text-[11.5px] font-semibold text-red-600 hover:underline">
                  {unnamed ? 'Add the company name' : `Edit details · ${gaps.length} missing`}
                </button>
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
