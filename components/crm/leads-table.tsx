'use client';

import { Lead } from '../../types/crm';
import { DateEditState } from './types/crm';
import { Avatar, EditableStatus, Th } from './ui';
import { fmtDate, fmtINR } from './utils/crm';
import { Dispatch, SetStateAction } from 'react';

export function LeadsTable({ COL_COUNT, filtered, filteredTotal, handleKylasSync, handleSort, isClosureOverdue, isColVisible, isOverdue, kylasSync, leadsLoading, paginatedRows, setDateEditPopup, setDrawerLead, sortCol, sortDir }: {
  COL_COUNT: number;
  filtered: Lead[];
  filteredTotal: number;
  handleKylasSync: (leadId: string) => Promise<void>;
  handleSort: (col: string) => void;
  isClosureOverdue: (l: Lead) => boolean;
  isColVisible: (key: string) => boolean;
  isOverdue: (l: Lead) => boolean;
  kylasSync: Record<string, { loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; }>;
  leadsLoading: boolean;
  paginatedRows: Lead[];
  setDateEditPopup: Dispatch<SetStateAction<DateEditState | null>>;
  setDrawerLead: Dispatch<SetStateAction<Lead | null>>;
  sortCol: string;
  sortDir: "asc" | "desc";
}) {
  return (
    <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
      <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FAFAFA]">
              {isColVisible('id') && <Th label="Lead ID" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="max-w-[110px] w-[110px]" />}
              {isColVisible('clientName') && <Th label="Client Name" sortKey="clientName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('clientPhone') && <Th label="Client Phone" sortKey="clientPhone" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('createdAt') && <Th label="Created" sortKey="createdAt" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('assignedTo') && <Th label="Assigned To" sortKey="assignedTo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('branch') && <Th label="Branch" sortKey="branch" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('clientType') && <Th label="Client Type" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('propertyType') && <Th label="Property Type" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('architectInvolved') && <Th label="Architect/Designer" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('projectPhase') && <Th label="Project Phase" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('status') && <Th label="Status" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('cartItems') && <Th label="Cart Items" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('followUpDate') && <Th label="Follow-up" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('closureDate') && <Th label="Closure Date" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              {isColVisible('cartValue') && <Th label="Cart Value" sortKey="cartValue" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />}
              <Th label="Actions" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />
            </tr>
          </thead>
          <tbody className={leadsLoading ? 'opacity-40 pointer-events-none' : ''}>
            {paginatedRows.map((l, i) => (
              <tr
                key={l.id + i}
                className="border-t border-gray-200 hover:bg-[#FFFAF7]"
              >
                {isColVisible('id') && <td className="px-3 py-2.5 text-[13px] align-middle w-[200px] min-w-[200px]">
                  <span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{l.id}</span>
                </td>}
                {isColVisible('clientName') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.clientName || '—'}</td>}
                {isColVisible('clientPhone') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs font-mono">{l.clientPhone || '—'}</td>}
                {isColVisible('createdAt') && <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(l.createdAt)}</td>}
                {isColVisible('assignedTo') && <td className="px-3 py-2.5 text-[13px] align-middle">
                  <div className="flex items-center gap-1.5">
                    <Avatar name={l.assignedTo} />
                    <span className="text-xs">{l.assignedTo}</span>
                  </div>
                </td>}
                {isColVisible('branch') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.branch || '—'}</td>}
                {isColVisible('clientType') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.clientType || '—'}</td>}
                {isColVisible('propertyType') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.propertyType || '—'}</td>}
                {isColVisible('architectInvolved') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">
                  {l.architectInvolved == null ? '—' : l.architectInvolved ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                </td>}
                {isColVisible('projectPhase') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.projectPhase || '—'}</td>}
                {isColVisible('status') && <td className="px-3 py-2.5 text-[13px] align-middle">
                  <EditableStatus status={l.status} lostReason={l.lostReason} />
                </td>}
                {isColVisible('cartItems') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs max-w-[200px]">
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                    {typeof l.cartItems === 'string' ? (l.cartItems || '—') : Array.isArray(l.cartItems) ? (l.cartItems.map(i => typeof i === 'string' ? i : i.name).join(', ') || '—') : '—'}
                  </span>
                </td>}
                {isColVisible('followUpDate') && <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'followUpDate' })}>
                  {l.followUpDate ? (
                    <span className={`text-xs border-b border-dashed border-gray-300 ${isOverdue(l) ? 'font-bold text-red-500' : 'font-normal text-gray-700'}`}>
                      {isOverdue(l) && '⚠ '}{fmtDate(l.followUpDate)}
                    </span>
                  ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                </td>}
                {isColVisible('closureDate') && <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'closureDate' })}>
                  {l.closureDate ? (
                    <span className={`text-xs border-b border-dashed border-gray-300 ${isClosureOverdue(l) ? 'font-bold text-red-500' : 'text-gray-500'}`}>
                      {isClosureOverdue(l) && '⚠ '}{fmtDate(l.closureDate)}
                    </span>
                  ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                </td>}
                {isColVisible('cartValue') && <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono font-bold">
                  {fmtINR(l.cartValue)}
                </td>}
                <td className="px-3 py-2.5 text-[13px] align-middle whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <button className="bg-transparent border-none cursor-pointer py-1 px-1.5 text-[13px] text-gray-700 relative" title="Edit" onClick={() => setDrawerLead(l)}>
                      Edit
                      {(l.remarks || []).length > 0 && <span className="absolute -top-1 -right-1 bg-[#EAB308] text-white text-[9px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">{l.remarks!.length}</span>}
                    </button>
                    <button
                      className="border border-gray-200 rounded-md cursor-pointer py-1 px-2.5 text-[11px] font-medium text-gray-600 hover:border-[#EAB308] hover:text-[#EAB308] disabled:opacity-40 disabled:cursor-default"
                      title="Sync this deal to Kylas if it's missing"
                      disabled={kylasSync[l.id]?.loading}
                      onClick={() => handleKylasSync(l.id)}
                    >
                      {kylasSync[l.id]?.loading ? 'Syncing…' : 'Kylas Sync'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {leadsLoading && (
              <tr><td colSpan={COL_COUNT} className="p-10 text-center text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-[#EAB308]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Loading leads...
                </div>
              </td></tr>
            )}
            {!leadsLoading && paginatedRows.length === 0 && (
              <tr><td colSpan={COL_COUNT} className="p-10 text-center text-gray-400">No leads found</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-[#FFF7F0]">
                <td colSpan={COL_COUNT - 2} className="px-3 py-2.5 text-[13px] align-middle font-semibold text-xs">Total ({filtered.length} deal{filtered.length !== 1 ? 's' : ''})</td>
                <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono font-bold text-[#EAB308]">{fmtINR(filteredTotal)}</td>
                <td className="px-3 py-2.5 text-[13px] align-middle" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </div>
    </div>
  );
}
