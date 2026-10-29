'use client';

import type { DragEvent, RefObject } from 'react';
import { useState } from 'react';

import { INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT } from '../../../constants/inbound';
import { isFollowUpStatus, lastAttempt } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { InboundStatus } from '../../../types/inbound';
import { FollowUpChip, LeadName, LeadTypeChip, PriorityChip } from '../../../ui/inbound-chips';
import { gapsFor } from '../utils';
import { EnqIdChip } from '.';

function LeadCard({ lead, today, onClick, onDragStart }: {
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
      {isFollowUpStatus(lead.stage) && (
        <div className="mt-1.5"><FollowUpChip date={lead.followUpDate} today={today} /></div>
      )}
      {(lead.stage === 'PI Shared' || lead.stage === 'Closed') && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <EnqIdChip id={lead.enqId} />
          {!!lead.orderValue && (
            <span className="text-[11px] font-mono font-semibold text-gray-700">{fmtINR(lead.orderValue)}</span>
          )}
        </div>
      )}
      {(lead.stage === 'PI Shared' || lead.stage === 'Closed') && lead.placedUnder?.ecName && (
        <div className="text-[10px] text-gray-500 mt-1 truncate">EC: {lead.placedUnder.ecName}</div>
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
          {attempts ? `${attempts} ${attempts === 1 ? 'call' : 'calls'} · ${last?.outcome}` : 'No calls yet'}
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

export function InboundBoard({ leads, today, total, scroll, onOpen, onMove }: {
  leads: InboundLead[];
  today: string;
  total: number;
  scroll: { ref: RefObject<HTMLDivElement | null>; onDragOver: (e: DragEvent<Element>) => void; onDragEnd: () => void; onDrop: () => void };
  onOpen: (id: string) => void;
  onMove: (id: string, target: InboundStatus) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<InboundStatus | null>(null);

  const drop = (s: InboundStatus) => {
    if (dragId) onMove(dragId, s);
    setDragId(null);
    setDragOver(null);
  };

  return (
    <div
      ref={scroll.ref}
      className="flex gap-3 overflow-x-auto pb-3 items-start"
      onDragOver={scroll.onDragOver}
      onDragEnd={scroll.onDragEnd}
      onDrop={scroll.onDrop}
    >
      {INBOUND_STATUSES.map((s) => {
        const items = leads.filter((l) => l.stage === s);
        const isOver = dragOver === s;
        return (
          <div
            key={s}
            className="flex-1 min-w-[220px] shrink-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
            onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
            onDrop={() => drop(s)}
          >
            <div className={`bg-[#F2F2F3] rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
              <div className="h-1" style={{ background: INBOUND_STATUS_COLORS[s] }} />
              <div className="px-3 py-2 bg-white border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{s}</span>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {s === 'New' && total > items.length ? `${items.length} of ${total}` : items.length}
                  </span>
                </div>
                <p className="text-[9.5px] text-gray-400 leading-snug mt-0.5">{INBOUND_STATUS_HINT[s]}</p>
              </div>
              <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                {items.length === 0
                  ? <div className="text-[11px] text-gray-400 text-center py-5">{isOver ? 'Drop here' : 'Empty'}</div>
                  : items.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      today={today}
                      onClick={() => onOpen(l.id)}
                      onDragStart={() => setDragId(l.id)}
                    />
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
