'use client';

import { Lead } from '../../../../types/crm';
import { STATUS_COLORS } from '../../constants';
import { Avatar } from '../../ui';
import { fmtDate, fmtINR } from '../../utils';
import { Dispatch, SetStateAction } from 'react';

export function LeadsCardList({ isOverdue, leadsLoading, paginatedRows, setDrawerLead }: {
  isOverdue: (l: Lead) => boolean;
  leadsLoading: boolean;
  paginatedRows: Lead[];
  setDrawerLead: Dispatch<SetStateAction<Lead | null>>;
}) {
  return (
    <div className={`sm:hidden flex flex-col gap-2 ${leadsLoading ? 'opacity-40 pointer-events-none' : ''}`}>
      {leadsLoading && <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm"><svg className="animate-spin h-4 w-4 text-[#EAB308]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Loading leads...</div>}
      {!leadsLoading && paginatedRows.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">No leads found</div>}
      {paginatedRows.map((l,i) => (
        <div key={l.id + i} className="bg-white rounded-lg border border-gray-200 px-4 py-3" onClick={() => setDrawerLead(l)}>
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[14px] truncate">{l.clientName || '—'}</div>
              <div className="font-mono text-[11px] text-gray-400">{l.clientPhone || '—'}</div>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: (STATUS_COLORS[l.status] || '#9CA3AF') + '20', color: STATUS_COLORS[l.status] || '#9CA3AF' }}>{l.status}</span>
          </div>
          <div className="flex gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
            {l.followUpDate && <span className={isOverdue(l) ? 'text-red-500 font-semibold' : ''}>{isOverdue(l) ? '⚠ ' : ''}Follow-up: {fmtDate(l.followUpDate)}</span>}
            {!l.followUpDate && <span className="text-gray-300">No follow-up date</span>}
            {l.closureDate && <span>Closure: {fmtDate(l.closureDate)}</span>}
            {(l.cartValue || 0) > 0 && <span className="font-mono font-semibold text-gray-700">{fmtINR(l.cartValue)}</span>}
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center gap-1.5">
              <Avatar name={l.assignedTo} size={18} />
              <span className="text-[11px] text-gray-500">{l.assignedTo}</span>
            </div>
            <span className="text-[11px] text-gray-400">{l.branch}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
