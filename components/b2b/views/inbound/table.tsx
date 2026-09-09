'use client';

import { FollowUpBucket, followUpBucket, lastAttempt } from '../../models/inboundModel';
import { InboundLead, fmtINR } from '../../models/mockData';
import { Empty, EnrichmentBadge, LeadName, PriorityChip, StatusBadge, fmtDay } from '../../ui/inboundChips';
import { BUCKET_NOTE, BUCKET_ORDER, BUCKET_TITLE, PRIORITY_RANK } from '../../constants/inbound-leads';
import { gapsFor } from '../../utils/inbound-leads';
import { useMemo } from 'react';

export function DailyTable({
  leads, today, onOpen,
}: {
  leads: InboundLead[]; today: string; onOpen: (id: string) => void;
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

  const anything = BUCKET_ORDER.some((k) => grouped[k].length > 0);
  if (!anything) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No leads on follow-up in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {BUCKET_ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (!rows.length) return null;
        return (
          <div key={bucket} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-baseline justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{BUCKET_TITLE[bucket]}</h3>
                <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
                <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{BUCKET_NOTE[bucket]}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Pri', 'Company', 'Contact', 'Client type', 'Status', 'Calls', 'Follow-up', 'BM', 'Value', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
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
          </div>
        );
      })}
    </div>
  );
}
