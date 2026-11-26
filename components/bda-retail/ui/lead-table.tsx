'use client';

import { useEffect, useState } from 'react';
import { Empty } from '../../b2b/ui/inbound-chips';
import { COHORT_BY_KEY, PAGE_SIZE } from '@/lib/bda-retail/constants';
import type { LeadView } from '@/lib/bda-retail/types';
import { rupees } from '@/lib/bda-retail/utils';
import { PriorityChip, StageChip } from './chips';

const dash = <span className="text-gray-300">—</span>;

export function LeadTable({ leads, onOpen, showOwner, empty, resetKey, head, picked, onToggle }: {
  leads: LeadView[];
  onOpen: (l: LeadView) => void;
  showOwner?: boolean;
  empty: string;
  resetKey: string;
  head?: React.ReactNode;
  picked?: Set<string>;
  onToggle?: (keys: string[], on: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const rows = leads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const cols = ['Pri', 'Customer', 'Phone', 'Cohort', 'Why they are here', 'Value', 'Entered', 'Branch', 'Stage', ...(showOwner ? ['BDA'] : []), 'Calls'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {head}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {picked && onToggle && (
                <th className="pl-3 w-6">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((l) => picked.has(l.key))}
                    onChange={(e) => onToggle(rows.map((l) => l.key), e.target.checked)}
                    aria-label="Select this page"
                  />
                </th>
              )}
              {cols.map((h) => (
                <th key={h} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key} onClick={() => onOpen(l)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                {picked && onToggle && (
                  <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.has(l.key)} onChange={(e) => onToggle([l.key], e.target.checked)} aria-label={`Select ${l.name || l.phone}`} />
                  </td>
                )}
                <td className="px-3 py-2"><PriorityChip p={l.priority} /></td>
                <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate">{l.name || dash}</td>
                <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{COHORT_BY_KEY[l.cohort].label}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[320px] truncate" title={l.detail}>{l.detail}</td>
                <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{l.value ? rupees(l.value) : dash}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.enteredOn}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.branch || dash}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StageChip stage={l.stage} />
                  {l.nextOn && <span className="ml-1.5 text-[11px] text-gray-500">{l.nextOn}</span>}
                </td>
                {showOwner && <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.claim?.by ?? dash}</td>}
                <td className="px-3 py-2 text-gray-600 tabular-nums">{l.calls.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty>{empty}</Empty>}
      <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100 gap-3 flex-wrap">
        <span className="text-[11px] text-gray-400">
          {leads.length ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, leads.length)} of ${leads.length}` : '0 shown'}
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
