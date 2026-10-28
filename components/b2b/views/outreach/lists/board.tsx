'use client';

import { OutreachLead, fmtINR } from '../../../models/mock-data';
import { OUTREACH_STATUSES, OUTREACH_STATUS_COLORS, OUTREACH_STATUS_HINT, OUTREACH_STATUS_LABEL, OutreachStatus, companyTypeLabel } from '../../../models/outreach';
import { useDragAutoScroll } from '../../../hooks/use-drag-auto-scroll';
import { Empty, EnrichmentBadge, fmtDay } from '../../../ui/inbound-chips';
import { MeetingProgress, OutreachLeadTypeChip, OutreachStatusBadge } from '../../../ui/outreach-chips';
import { PAGE_SIZE } from '../constants';
import { LeadCard } from './cards';
import { gapsFor } from '../utils';
import { useEffect, useState } from 'react';

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

export function OutreachList({ leads, onOpen }: { leads: OutreachLead[]; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [leads.length]);
  const pages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const rows = leads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Company', 'Contact', 'Type', 'Seg', 'Source', 'Lead', 'Status', 'Meetings', 'Follow-up', 'Enq ID', 'Value', 'BM', ''].map((h, i) => (
                <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const gaps = gapsFor(l);
              return (
                <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate">{l.company}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{l.segment || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.source || '—'}</td>
                  <td className="px-3 py-2"><OutreachLeadTypeChip t={l.leadType} /></td>
                  <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                  <td className="px-3 py-2"><MeetingProgress meetings={l.meetings} /></td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.followUpDate ? fmtDay(l.followUpDate) : '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{l.enqId || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                    {l.orderValue ? fmtINR(l.orderValue)
                      : l.expectedOrderValue ? <span className="text-gray-400" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span>
                        : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                  <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty>No leads match these filters.</Empty>}
      <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
        <span className="text-[11px] text-gray-400">
          {leads.length ? `Showing ${page * PAGE_SIZE + 1}–${Math.min(leads.length, (page + 1) * PAGE_SIZE)} of ${leads.length}` : 'Showing 0 of 0'}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
          <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}
