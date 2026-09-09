'use client';

import { CsvRow } from '../../types';
import { StatusBadge } from '../../ui';
import { fmtDate, fmtINR } from '../../utils';
import { Dispatch, SetStateAction } from 'react';

export function CsvPreviewModal({ csvPreview, csvSelected, importCsvLeads, setCsvPreview, setCsvSelected }: {
  csvPreview: CsvRow[];
  csvSelected: Set<number>;
  importCsvLeads: () => void;
  setCsvPreview: Dispatch<SetStateAction<CsvRow[] | null>>;
  setCsvSelected: Dispatch<SetStateAction<Set<number>>>;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[1100px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Review CSV Import</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={() => { setCsvPreview(null); setCsvSelected(new Set()); }}>&times;</button>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13px] mb-3 text-gray-700">
            <strong>{csvPreview.length}</strong> lead{csvPreview.length !== 1 ? 's' : ''} ready to import
          </p>
          <div className="max-h-[350px] overflow-y-auto border border-gray-200 rounded-md">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAFAFA] sticky top-0">
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none w-8">
                    <input type="checkbox" checked={csvSelected.size === csvPreview.length} onChange={(e) => {
                      if (e.target.checked) setCsvSelected(new Set(csvPreview.map((_, i) => i)));
                      else setCsvSelected(new Set());
                    }} />
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Row#</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Lead ID</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Client Name</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Phone</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Created</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Assigned To</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Branch</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Status</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Cart Items</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right whitespace-nowrap select-none">Cart Value</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Remarks</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Visits</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Client Type</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Property Type</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Architect</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.map((row, i) => (
                  <tr key={i} className={`border-t border-gray-100 ${csvSelected.has(i) ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2.5 text-[13px] align-middle w-8">
                      <input type="checkbox" checked={csvSelected.has(i)} onChange={() => {
                        setCsvSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                      }} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">{i + 2}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle"><span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded">{row.leadId}</span></td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">{row.clientName || '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle font-mono text-[11px]">{row.clientPhone}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] text-gray-500">{fmtDate(row.createdAt)}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">{row.assignedTo}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">{row.branch}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {(typeof row.cartItems === 'string' ? row.cartItems : Array.isArray(row.cartItems) ? (row.cartItems as string[]).join(', ') : '') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono text-[11px]">{fmtINR(row.cartValue)}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.remarks.length || '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.visits.length || '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-[11px]">{row.clientType || '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-[11px]">{row.propertyType || '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.architectInvolved ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => { setCsvPreview(null); setCsvSelected(new Set()); }}>Cancel</button>
          <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer ${csvSelected.size === 0 ? 'opacity-50' : 'opacity-100'}`} disabled={csvSelected.size === 0} onClick={importCsvLeads}>
            Import Selected ({csvSelected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
