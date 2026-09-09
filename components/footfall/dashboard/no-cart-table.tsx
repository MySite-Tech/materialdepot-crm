'use client';

import { FootfallNoCartPage } from '../../../lib/api/dashboards';
import { Dispatch, SetStateAction } from 'react';

export function FootfallNoCartTable({ NC_PAGE_SIZE, ncData2, ncLoading2, ncSearch2, setNcPage2, setNcSearch2 }: {
  NC_PAGE_SIZE: 10;
  ncData2: FootfallNoCartPage | null;
  ncLoading2: boolean;
  ncSearch2: string;
  setNcPage2: Dispatch<SetStateAction<number>>;
  setNcSearch2: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-bold text-gray-800 shrink-0">No Cart Created</span>
        <input
          type="text"
          placeholder="Search name, contact or BM…"
          value={ncSearch2}
          onChange={e => setNcSearch2(e.target.value)}
          className="flex-1 max-w-[260px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-red-400 bg-white"
        />
        {ncData2 && (
          <span className="text-[11px] text-gray-400 ml-auto shrink-0">{ncData2.count.toLocaleString()} clients</span>
        )}
        {ncLoading2 && (
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin shrink-0" />
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">#</th>
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Name</th>
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Contact</th>
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">BM</th>
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Deal Ticket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!ncLoading2 && (!ncData2 || ncData2.results.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-gray-400">
                  No clients without a cart found.
                </td>
              </tr>
            )}
            {ncLoading2 && !ncData2 && Array.from({ length: NC_PAGE_SIZE }).map((_, i) => (
              <tr key={i}>
                {[1,2,3,4,5].map(c => (
                  <td key={c} className="px-4 sm:px-5 py-2.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: c === 1 ? 24 : c === 3 ? 80 : c === 5 ? 60 : '70%' }} />
                  </td>
                ))}
              </tr>
            ))}
            {ncData2?.results.map((row, i) => {
              const globalIdx = ((ncData2.page - 1) * NC_PAGE_SIZE) + i + 1;
              return (
                <tr key={row.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 sm:px-5 py-2.5 text-gray-400 tabular-nums">{globalIdx}</td>
                  <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{row.name || '—'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-gray-500 font-mono">{row.contact || '—'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-gray-600">{row.bm}</td>
                  <td className="px-4 sm:px-5 py-2.5">
                    {row.has_deal_ticket ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100">
                        ✓ Created
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ncData2 && ncData2.total_pages > 1 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] text-gray-400">
            Showing {((ncData2.page - 1) * NC_PAGE_SIZE) + 1}–{Math.min(ncData2.page * NC_PAGE_SIZE, ncData2.count)} of {ncData2.count}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setNcPage2(1)} disabled={ncData2.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
            <button onClick={() => setNcPage2(p => Math.max(1, p - 1))} disabled={ncData2.page <= 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <span className="text-[11px] text-gray-500 px-2">Page {ncData2.page} of {ncData2.total_pages}</span>
            <button onClick={() => setNcPage2(p => Math.min(ncData2.total_pages, p + 1))} disabled={ncData2.page >= ncData2.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
            <button onClick={() => setNcPage2(ncData2.total_pages)} disabled={ncData2.page >= ncData2.total_pages} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
