'use client';

import { lastAttempt } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { Empty, FollowUpChip, LeadName, LeadTypeChip, PriorityChip } from '../../../ui/inbound-chips';
import { gapsFor } from '../utils';

export function Tile({
  label, value, sub, accent, muted,
}: {
  label: string; value: string; sub?: string; accent?: string; muted?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />}
        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      </div>
      <div className={`text-[22px] font-bold leading-tight mt-1 ${muted ? 'text-gray-300' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function LeadCard({ lead, today, onClick, onDragStart }: {
  lead: InboundLead; today: string; onClick: () => void; onDragStart: () => void;
}) {
  const gaps = gapsFor(lead);
  const last = lastAttempt(lead.callAttempts);
  const attempts = lead.callAttempts?.length || 0;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#0F766E] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-[12.5px] font-semibold text-gray-900 leading-tight min-w-0 truncate">
          <LeadName lead={lead} />
        </div>
        <PriorityChip p={lead.priority} />
      </div>
      <div className="text-[10.5px] text-gray-400 mt-0.5 font-mono truncate">{lead.phone || '—'}</div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {lead.clientType && <span className="text-[10px] text-gray-500">{lead.clientType}</span>}
        <LeadTypeChip t={lead.leadType} />
      </div>
      {(lead.stage === 'Follow up' || lead.stage === 'PI Shared') && (
        <div className="mt-1.5"><FollowUpChip date={lead.followUpDate} today={today} /></div>
      )}
      {(lead.stage === 'PI Shared' || lead.stage === 'Closed') && !!lead.orderValue && (
        <div className="text-[11px] font-mono font-semibold text-gray-700 mt-1.5">{fmtINR(lead.orderValue)}</div>
      )}
      {lead.stage === 'Lost' && (
        <div className="text-[10.5px] text-red-500 mt-1.5 leading-snug">
          {lead.lostReason || <span className="text-amber-600">No reason recorded</span>}
        </div>
      )}
      {lead.stage === 'Closed' && (
        <div className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">
          {lead.kam ? `KAM: ${lead.kam}` : <span className="text-amber-600">No KAM assigned</span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {attempts ? `${attempts}/4 · ${last?.outcome}` : 'No calls yet'}
        </span>
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">
            ⚠ {gaps.length}
          </span>
        )}
      </div>
    </div>
  );
}

export function SidePanel({
  title, note, leads, today, onOpen, emptyText,
}: {
  title: string; note: string; leads: InboundLead[]; today: string;
  onOpen: (id: string) => void; emptyText: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12px] font-bold text-gray-800">{title}</h3>
          <span className="text-[11px] font-semibold text-gray-400">{leads.length}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{note}</p>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
        {leads.length === 0 ? <Empty>{emptyText}</Empty> : leads.map((l) => (
          <button
            key={l.id}
            onClick={() => onOpen(l.id)}
            className="w-full text-left px-4 py-2.5 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-semibold text-gray-900 truncate"><LeadName lead={l} /></span>
              <PriorityChip p={l.priority} />
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{l.phone || '—'}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] text-gray-500">{l.owner}</span>
              {!!l.orderValue && <span className="text-[10px] font-mono font-semibold text-gray-700">{fmtINR(l.orderValue)}</span>}
              {l.stage === 'PI Shared' && <FollowUpChip date={l.followUpDate} today={today} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
