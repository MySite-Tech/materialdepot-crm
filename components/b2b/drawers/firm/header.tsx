'use client';

import { ReactNode } from 'react';
import { LINK_CLS } from './constants';
import { SPOC_LABEL, SpocReadState, spocPending, spocUnread } from './cards/spocs';
import { fmtDate, fmtPhone } from './utils';
import { ClientEntity, ClientStatus, FirmSpoc, normalizeContactNumber, primaryContact } from '../../models/client';
import { StatusPill } from '../../ui/client-chips';
import { Hint } from '../../ui/info-tip';
import { btnGhost } from '../../constants/ui';

export type FirmTab = 'activity' | 'overview' | 'orders' | 'people' | 'ec' | 'referrals';

export interface FirmTabDef { key: FirmTab; label: string; badge?: string; warn?: boolean }

export function FirmDrawerHeader({ client, status, days, badges, spocs, read, onPeople, onEdit, onClose, tabs, tab, onTab }: {
  client: ClientEntity;
  status: ClientStatus;
  days?: number;
  badges?: ReactNode;
  spocs: FirmSpoc[];
  read: SpocReadState;
  onPeople?: () => void;
  onEdit?: () => void;
  onClose: () => void;
  tabs: FirmTabDef[];
  tab: FirmTab;
  onTab: (t: FirmTab) => void;
}) {
  const phone = normalizeContactNumber(primaryContact(client.contacts)?.number || '');
  const facts = [client.clientType || 'Type not set', client.segment ? `Segment ${client.segment}` : 'No segment', client.source].filter(Boolean);
  const nameOf = (s: FirmSpoc) => (spocUnread(s.role, read) ? 'Unknown' : spocPending(s.role, read) ? '…' : s.name);
  const info = ['One SPoC per team, across the whole journey.', ...spocs.map((s) => `${SPOC_LABEL[s.role]}: ${spocUnread(s.role, read)
    ? 'could not be read'
    : [s.detail, s.since && `since ${fmtDate(s.since)}`].filter(Boolean).join(', ')}`)].join('\n');

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-gray-900 truncate">{client.company || <span className="text-gray-400">Unnamed firm</span>}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {phone
                ? <a href={`tel:${phone}`} className="text-[12px] font-mono text-gray-600 hover:text-[#0F766E]">{fmtPhone(phone)}</a>
                : <span className="text-[12px] text-amber-700">No number</span>}
              <StatusPill status={status} days={days} />
              {badges}
              <span className="text-[12px] text-gray-500">{facts.join(' · ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && <button onClick={onEdit} className={btnGhost}>Edit details</button>}
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px]">
          {spocs.map((s) => {
            const name = nameOf(s);
            return (
              <span key={s.role} className="whitespace-nowrap">
                <span className="text-gray-400">{SPOC_LABEL[s.role]}{' '}</span>
                <span className={name === 'Unknown' ? 'text-blue-700' : name ? 'font-medium text-gray-800' : 'text-gray-300'}>{name || '—'}</span>
              </span>
            );
          })}
          <Hint text={info} />
          {onPeople && <button onClick={onPeople} className={LINK_CLS}>Change</button>}
        </div>
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
