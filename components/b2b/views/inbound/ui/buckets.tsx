'use client';

import type { DragEvent } from 'react';

import { INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT } from '../../../constants/inbound';
import { lastAttempt } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { InboundStatus } from '../../../types/inbound';
import { View } from '../types';
import { Empty, EnrichmentBadge, LeadName, LeadTypeChip, PriorityChip, Spinner, StatusBadge, fmtDay } from '../../../ui/inbound-chips';
import { gapsFor } from '../utils';
import { DailyTable } from './table';
import { LeadCard, SidePanel } from '.';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function InboundBuckets({ byStatus, dragId, dragOver, filtered, followUpLeads, hasMore, kanbanScroll, listPage, listPages, listRows, loadMore, loadingMore, newToday, piLeads, requestMove, setDragId, setDragOver, setListPage, setSelectedId, today, total, view }: {
  byStatus: (s: InboundStatus) => InboundLead[];
  dragId: string | null;
  dragOver: InboundStatus | null;
  filtered: InboundLead[];
  followUpLeads: InboundLead[];
  hasMore: boolean;
  kanbanScroll: { ref: RefObject<HTMLDivElement | null>; onDragOver: (e: DragEvent<Element>) => void; onDragEnd: () => void; onDrop: () => void; };
  listPage: number;
  listPages: number;
  listRows: InboundLead[];
  loadMore: () => void;
  loadingMore: boolean;
  newToday: InboundLead[];
  piLeads: InboundLead[];
  requestMove: (id: string, target: InboundStatus) => void;
  setDragId: Dispatch<SetStateAction<string | null>>;
  setDragOver: Dispatch<SetStateAction<InboundStatus | null>>;
  setListPage: Dispatch<SetStateAction<number>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  today: string;
  total: number;
  view: View;
}) {
  return (
    <>
    
      {view === 'today' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 items-start">
          <DailyTable leads={followUpLeads} today={today} onOpen={setSelectedId} />
          <div className="flex flex-col gap-3">
            <SidePanel
              title="New — not yet actioned"
              note="Straight from Kylas. Log the first call to start the attempt cycle."
              leads={newToday}
              today={today}
              onOpen={setSelectedId}
              emptyText="Nothing new waiting."
            />
            <SidePanel
              title="PI Shared"
              note="Awaiting a decision. Order value comes from the deal ticket."
              leads={piLeads}
              today={today}
              onOpen={setSelectedId}
              emptyText="No PIs out."
            />
          </div>
        </div>
      )}
    
      {view === 'board' && (
        <div
          ref={kanbanScroll.ref}
          className="flex gap-3 overflow-x-auto pb-3 items-start"
          onDragOver={kanbanScroll.onDragOver}
          onDragEnd={kanbanScroll.onDragEnd}
          onDrop={kanbanScroll.onDrop}
        >
          {INBOUND_STATUSES.map((s) => {
            const items = byStatus(s);
            const isOver = dragOver === s;
            return (
              <div
                key={s}
                className="flex-1 min-w-[220px] shrink-0"
                onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
                onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
                onDrop={() => dragId && requestMove(dragId, s)}
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
                          onClick={() => setSelectedId(l.id)}
                          onDragStart={() => setDragId(l.id)}
                        />
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    
      {view === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Company', 'Contact', 'Client type', 'Seg', 'Lead', 'Pri', 'Status', 'Calls', 'Follow-up', 'BM', 'Location', 'Value', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listRows.map((l) => {
                  const last = lastAttempt(l.callAttempts);
                  const gaps = gapsFor(l);
                  return (
                    <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate"><LeadName lead={l} /></td>
                      <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.clientType || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{l.segment || '—'}</td>
                      <td className="px-3 py-2"><LeadTypeChip t={l.leadType} /></td>
                      <td className="px-3 py-2"><PriorityChip p={l.priority} /></td>
                      <td className="px-3 py-2"><StatusBadge s={l.stage} /></td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {l.callAttempts?.length ? `${l.callAttempts.length}/4 ${last?.outcome}` : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {l.followUpDate ? fmtDay(l.followUpDate) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.owner}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.location || '—'}</td>
                      <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                        {l.orderValue ? fmtINR(l.orderValue)
                          : l.expectedOrderValue ? <span className="text-gray-400">~{fmtINR(l.expectedOrderValue)}</span>
                            : '—'}
                      </td>
                      <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {listRows.length === 0 && <Empty>No leads match these filters.</Empty>}
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              Page {listPage + 1} of {listPages} · {filtered.length} loaded
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                disabled={listPage === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40"
              >← Prev</button>
              <button
                onClick={() => setListPage((p) => Math.min(listPages - 1, p + 1))}
                disabled={listPage >= listPages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40"
              >Next →</button>
            </div>
          </div>
        </div>
      )}
    
      {hasMore && (
        <div className="flex items-center justify-center py-4">
          {loadingMore ? <Spinner label="Loading more…" /> : (
            <button
              onClick={loadMore}
              className="px-4 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              Load more from Kylas{total > 0 ? ` · ${total} unactioned in total` : ''}
            </button>
          )}
        </div>
      )}
    </>
  );
}
