'use client';

import { OutreachLead } from '../../../models/mock-data';
import { OUTREACH_STATUSES, OUTREACH_STATUS_COLORS, OUTREACH_STATUS_HINT, OUTREACH_STATUS_LABEL, OutreachStatus } from '../../../models/outreach';
import { useDragAutoScroll } from '../../../hooks/use-drag-auto-scroll';
import { LeadCard } from './cards';
import { useState } from 'react';

export function OutreachBoard({ leads, today, onOpen, onMove }: {
  leads: OutreachLead[]; today: string; onOpen: (id: string) => void; onMove: (id: string, target: OutreachStatus) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<OutreachStatus | null>(null);
  const scroll = useDragAutoScroll<HTMLDivElement>();
  const drop = (s: OutreachStatus) => {
    if (dragId) onMove(dragId, s);
    setDragId(null);
    setDragOver(null);
  };
  return (
    <div ref={scroll.ref} className="flex gap-3 overflow-x-auto pb-3 items-start"
      onDragOver={scroll.onDragOver} onDragEnd={scroll.onDragEnd} onDrop={scroll.onDrop}>
      {OUTREACH_STATUSES.map((s) => {
        const items = leads.filter((l) => l.status === s);
        const isOver = dragOver === s;
        return (
          <div key={s} className="flex-1 min-w-[220px] shrink-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
            onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
            onDrop={() => drop(s)}>
            <div className={`bg-[#F2F2F3] rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
              <div className="h-1" style={{ background: OUTREACH_STATUS_COLORS[s] }} />
              <div className="px-3 py-2 bg-white border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{OUTREACH_STATUS_LABEL[s]}</span>
                  <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                </div>
                <p className="text-[9.5px] text-gray-400 leading-snug mt-0.5">{OUTREACH_STATUS_HINT[s]}</p>
              </div>
              <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                {items.length === 0
                  ? <div className="text-[11px] text-gray-400 text-center py-5">{isOver ? 'Drop here' : 'Empty'}</div>
                  : items.map((l) => (
                    <LeadCard key={l.id} lead={l} today={today} onClick={() => onOpen(l.id)} onDragStart={() => setDragId(l.id)} />
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
