'use client';

import { ReactNode } from 'react';

import { callTally, inboundWorkDay, isOpenStatus, istDay, lastAttempt } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { CrmAddedTag, Empty, FollowUpChip, LeadName, PriorityChip, StatusBadge, fmtDay, fmtLeadDateTime } from '../../../ui/inbound-chips';
import { LENS, LIST_PAGE_SIZE, OUTCOME_LENSES } from '../constants';
import { Lens } from '../types';
import { gapsFor } from '../utils';

const SINGLE_STATUS: Lens[] = ['new', 'nurture', 'followup', 'pi', 'closed', 'lost', 'invalid'];

const th = 'px-3 py-2 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';

function When({ lead, today }: { lead: InboundLead; today: string }) {
  if (lead.stage === 'New' && !(lead.callAttempts || []).length) {
    const day = inboundWorkDay(lead.leadCreatedAt);
    if (!day) return <span className="text-gray-600">—</span>;
    if (day > today) return <span className="text-gray-500" title={fmtLeadDateTime(lead.leadCreatedAt)}>After 7 pm · counts {fmtDay(day)}</span>;
    return <span className="text-gray-600" title={fmtLeadDateTime(lead.leadCreatedAt)}>{day === today ? 'For today' : `Since ${fmtDay(day)}`}</span>;
  }
  if (isOpenStatus(lead.stage)) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <FollowUpChip date={lead.followUpDate} today={today} />
        {lead.followUpDate && (
          <span className="text-[10.5px] text-gray-400">{fmtDay(lead.followUpDate)}</span>
        )}
      </div>
    );
  }
  return <span className="text-gray-500">{lead.statusChangedAt ? `${lead.stage} ${fmtDay(istDay(lead.statusChangedAt))}` : '—'}</span>;
}

function Outcome({ lead, lens }: { lead: InboundLead; lens: Lens }) {
  const r = lead.outreachReferral;
  if (lens === 'sent' && r?.at) {
    return (
      <div className="flex flex-col gap-0.5 text-[11.5px]">
        <span className="text-[#0F766E] font-semibold">Sent {fmtDay(istDay(r.at))} by {r.by}</span>
        <span className="text-gray-500">Meet {fmtDay(r.meetingDate)}{r.meetingTime ? ` · ${r.meetingTime}` : ''} · {r.decisionMaker}</span>
      </div>
    );
  }
  if (lead.stage === 'Invalid') {
    if (!lead.invalidReason || !lead.invalidNote) {
      return <span className="text-amber-600 font-semibold">{lead.invalidReason || 'No reason recorded'}{lead.invalidNote ? '' : ' · no note'}</span>;
    }
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-700 font-semibold">{lead.invalidReason}</span>
        <span className="text-[11px] text-gray-500 line-clamp-2" title={lead.invalidNote}>{lead.invalidNote}</span>
      </div>
    );
  }
  return <Deal lead={lead} />;
}

function Day({ day, empty }: { day: string; empty: string }) {
  return day ? <span className="text-gray-700">{fmtDay(day)}</span> : <span className="text-gray-300">{empty}</span>;
}

function Calls({ lead }: { lead: InboundLead }) {
  const t = callTally(lead.callAttempts);
  const last = lastAttempt(lead.callAttempts);
  if (!t.total) return <span className="text-gray-300">None yet</span>;
  return (
    <span title={`${t.connected} connected · ${t.rnr} RNR`}>
      {t.total} · <span className={last?.outcome === 'RNR' ? 'text-red-500' : 'text-[#0F766E]'}>last {last?.outcome}</span>
    </span>
  );
}

function Deal({ lead }: { lead: InboundLead }) {
  if (lead.stage === 'Lost') {
    return lead.lostReason
      ? <span className="text-red-500">{lead.lostReason}</span>
      : <span className="text-amber-600 font-semibold">No reason recorded</span>;
  }
  const value = lead.orderValue
    ? <span className="font-mono text-gray-800">{fmtINR(lead.orderValue)}</span>
    : lead.expectedOrderValue ? <span className="font-mono text-gray-400" title="BM’s estimate, no deal ticket yet">~{fmtINR(lead.expectedOrderValue)}</span> : null;
  const enq = lead.enqId
    ? <span className="font-mono text-[11px] text-gray-500">{lead.enqId}</span>
    : lead.stage === 'PI Shared' ? <span className="text-[11px] font-semibold text-amber-600">No Enq ID</span> : null;
  if (!value && !enq) return <span className="text-gray-300">—</span>;
  return <div className="flex flex-col gap-0.5 whitespace-nowrap">{value}{enq}</div>;
}

export function LeadTable({ lens, rows, today, showOwner, searchQuery, valueText, page, setPage, onOpen, onClearSearch, emptyAction }: {
  lens: Lens;
  rows: InboundLead[];
  today: string;
  showOwner: boolean;
  searchQuery: string;
  valueText?: string;
  page: number;
  setPage: (p: number) => void;
  onOpen: (id: string) => void;
  onClearSearch: () => void;
  emptyAction?: ReactNode;
}) {
  const meta = LENS[lens];
  const pages = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * LIST_PAGE_SIZE, (cur + 1) * LIST_PAGE_SIZE);
  const showStatus = !SINGLE_STATUS.includes(lens);
  const showGaps = lens === 'gaps';
  const isResult = !searchQuery && OUTCOME_LENSES.includes(lens);
  const outcomeHead = lens === 'lost' ? 'Lost reason' : lens === 'invalid' ? 'Why invalid' : lens === 'sent' ? 'Handed over' : isResult ? 'Outcome' : 'Deal';

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: meta.accent }} />
            <h2 className="text-[14px] font-bold text-gray-900">
              {searchQuery ? `${lens === 'all' ? 'Leads' : meta.title} matching “${searchQuery}”` : meta.title}
            </h2>
            <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{rows.length}</span>
            {valueText && <span className="text-[12px] font-semibold text-gray-600">· {valueText}</span>}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            {searchQuery ? 'The search covers every stage and owner in the Kylas B2B pipeline, wider than the board itself.' : meta.rule}
          </p>
        </div>
        {searchQuery && (
          <button onClick={onClearSearch} className="shrink-0 px-2.5 py-1 text-[11.5px] font-semibold border border-gray-200 rounded-md text-gray-600 hover:border-gray-400">
            Clear search ×
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Empty>{searchQuery ? `No lead here matches “${searchQuery}”.` : meta.empty}</Empty>
          {emptyAction}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className={th}>Pri</th>
                <th className={th}>Lead</th>
                {showStatus && <th className={th}>Status</th>}
                <th className={th}>{isResult ? 'Outcome on' : 'When'}</th>
                {!isResult && <th className={th}>Calls</th>}
                {showOwner && <th className={th}>Owner</th>}
                <th className={th}>{outcomeHead}</th>
                {showGaps && <th className={th}>Missing</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                return (
                  <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className={td}><PriorityChip p={l.priority} /></td>
                    <td className={`${td} max-w-[260px]`}>
                      <div className="font-semibold text-gray-900 truncate"><LeadName lead={l} /><CrmAddedTag lead={l} /></div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {l.phone
                          ? <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} className="font-mono hover:text-[#0F766E] hover:underline">{l.phone}</a>
                          : <span className="text-gray-300">No phone</span>}
                        {l.clientType && <span className="text-gray-400"> · {l.clientType}</span>}
                      </div>
                    </td>
                    {showStatus && <td className={td}><StatusBadge s={l.stage} /></td>}
                    {isResult ? (
                      <td className={`${td} whitespace-nowrap`}>
                        <Day day={istDay(lens === 'sent' || isOpenStatus(l.stage) ? l.outreachReferral?.at : l.statusChangedAt)} empty="—" />
                      </td>
                    ) : <td className={`${td} whitespace-nowrap`}><When lead={l} today={today} /></td>}
                    {!isResult && (
                      <td className={`${td} whitespace-nowrap text-gray-500`}>
                        <Calls lead={l} />
                      </td>
                    )}
                    {showOwner && <td className={`${td} whitespace-nowrap text-gray-500`}>{l.owner}</td>}
                    <td className={`${td} max-w-[260px]`}><Outcome lead={l} lens={lens} /></td>
                    {showGaps && (
                      <td className={`${td} max-w-[260px] text-[11px] text-amber-700`}>
                        {gapsFor(l).map((g) => g.label).join(', ')}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            Showing {cur * LIST_PAGE_SIZE + 1}–{Math.min(rows.length, (cur + 1) * LIST_PAGE_SIZE)} of {rows.length}
          </span>
          {rows.length > LIST_PAGE_SIZE && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(cur - 1)} disabled={cur === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
