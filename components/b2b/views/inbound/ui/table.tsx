'use client';

import { FollowUpBucket, followUpBucket, lastAttempt } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { Empty, EnrichmentBadge, LeadName, PriorityChip, StatusBadge, fmtDay } from '../../../ui/inbound-chips';
import { BUCKET_NOTE, BUCKET_ORDER, BUCKET_TITLE, PRIORITY_RANK } from '../constants';
import { gapsFor } from '../utils';
import { useMemo, useState } from 'react';

const ROW_LIMIT = 8;

export function DailyTable({
  leads, searchLeads, searchQuery, newCount, piCount, today, onOpen, onShowList,
}: {
  leads: InboundLead[]; searchLeads: InboundLead[]; searchQuery: string;
  newCount: number; piCount: number; today: string;
  onOpen: (id: string) => void; onShowList: () => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<FollowUpBucket, InboundLead[]> = { overdue: [], today: [], upcoming: [], none: [] };
    for (const l of leads) g[followUpBucket(l.followUpDate, today)].push(l);
    for (const k of BUCKET_ORDER) {
      g[k].sort((a, b) => {
        const p = (PRIORITY_RANK[a.priority || ''] ?? 3) - (PRIORITY_RANK[b.priority || ''] ?? 3);
        if (p !== 0) return p;
        const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
        if (d !== 0) return k === 'upcoming' ? d : -d;
        return (a.followUpTime || '').localeCompare(b.followUpTime || '');
      });
    }
    return g;
  }, [leads, today]);

  if (searchQuery) {
    return searchLeads.length ? (
      <LeadCardTable
        title={`Search results for “${searchQuery}”`}
        count={searchLeads.length}
        note="Every stage — check the Status column."
        rows={searchLeads}
        onOpen={onOpen}
      />
    ) : (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No lead matches “{searchQuery}” in any stage.</Empty>
      </div>
    );
  }

  const anything = BUCKET_ORDER.some((k) => grouped[k].length > 0);
  const elsewhere = [
    newCount > 0 && `${newCount} new ${newCount === 1 ? 'lead is' : 'leads are'} waiting for a first call`,
    piCount > 0 && `${piCount} ${piCount === 1 ? 'lead is' : 'leads are'} at PI Shared`,
  ].filter(Boolean).join(' and ');

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-[13px] font-bold text-gray-800">Follow-up call list</h2>
        <p className="text-[10.5px] text-gray-400 leading-snug">
          Leads already contacted and waiting on a follow-up. New and PI Shared leads are on the right.
        </p>
      </div>
      {!anything && (
        <div className="bg-white rounded-lg border border-gray-200 py-8 px-4 text-center">
          <p className="text-[12px] font-semibold text-gray-600">No follow-ups in this filter.</p>
          {elsewhere && (
            <p className="text-[11px] text-gray-500 mt-1">
              {elsewhere} — see the panel on the right<span className="xl:hidden"> below</span>.
            </p>
          )}
          <button
            onClick={onShowList}
            className="mt-3 px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
          >
            See every lead in List view →
          </button>
        </div>
      )}
      {BUCKET_ORDER.map((bucket) => grouped[bucket].length > 0 && (
        <LeadCardTable
          key={bucket}
          title={BUCKET_TITLE[bucket]}
          count={grouped[bucket].length}
          note={BUCKET_NOTE[bucket]}
          rows={grouped[bucket]}
          onOpen={onOpen}
          startCollapsed={bucket === 'upcoming' || bucket === 'none'}
        />
      ))}
    </div>
  );
}

function LeadCardTable({
  title, count, note, rows, onOpen, startCollapsed = false,
}: {
  title: string; count: number; note: string; rows: InboundLead[];
  onOpen: (id: string) => void; startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, ROW_LIMIT);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-baseline justify-between gap-2 px-4 py-2.5 text-left hover:bg-gray-50 ${open ? 'border-b border-gray-100' : ''}`}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{title}</h3>
          <span className="text-[11px] font-semibold text-gray-400">{count}</span>
          <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{note}</span>
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{open ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {open && <>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Pri', 'Company', 'Contact', 'Client type', 'Status', 'Calls', 'Follow-up', 'BM', 'Enq / Cart ID', 'Assisted at EC', 'Value', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const last = lastAttempt(l.callAttempts);
                const gaps = gapsFor(l);
                return (
                  <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2"><PriorityChip p={l.priority} /></td>
                    <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">
                      <LeadName lead={l} />
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.clientType || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge s={l.stage} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {l.callAttempts?.length
                        ? <>{l.callAttempts.length}/4 <span className={last?.outcome === 'RNR' ? 'text-red-500' : 'text-[#0F766E]'}>{last?.outcome}</span></>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.followUpDate
                        ? <span className="text-gray-600">{fmtDay(l.followUpDate)}{l.followUpTime ? ` · ${l.followUpTime}` : ''}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.owner}</td>
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">
                      {l.enqId || (l.stage === 'PI Shared' ? <span className="text-amber-600 font-sans">No Enq ID</span> : <span className="text-gray-300">—</span>)}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[160px] truncate">
                      {l.placedUnder?.ecName || <span className="text-gray-300">—</span>}
                    </td>
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
        {rows.length > ROW_LIMIT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full px-4 py-2 border-t border-gray-100 text-[11.5px] font-semibold text-[#0F766E] hover:bg-gray-50"
          >
            {showAll ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </>}
    </div>
  );
}
