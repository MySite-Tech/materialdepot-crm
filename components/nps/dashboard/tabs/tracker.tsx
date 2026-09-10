'use client';


import { NPSRow } from '../../../../lib/api/dashboards/nps';
import { Metrics, SortKey } from '../types';
import { fmtDate, fmtPhone, fmtSigned } from '../utils';
import { ResultPill, WaitChip } from '../ui';
import { Dispatch, SetStateAction } from 'react';

function SortHead({ label, k, sort, toggleSort }: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toggleSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-5 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort(k)}>
      {label}{sort.key === k && <span className="ml-1 text-blue-500">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

export function NpsTrackerTab({ PAGE_SIZE, avgWait, compAvg, compNps, completedRows, cur, loading, page, pageRows, pendingRows, setActive, setPage, setSort, setSubTab, sortedRows, staleCount, subTab, totalPages, sort, toggleSort }: {
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toggleSort: (key: SortKey) => void;
  PAGE_SIZE: 25;
  avgWait: string;
  compAvg: string;
  compNps: number | null;
  completedRows: NPSRow[];
  cur: Metrics;
  loading: boolean;
  page: number;
  pageRows: NPSRow[];
  pendingRows: NPSRow[];
  setActive: Dispatch<SetStateAction<NPSRow | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setSort: Dispatch<SetStateAction<{ key: SortKey; dir: "asc" | "desc"; }>>;
  setSubTab: Dispatch<SetStateAction<"pending" | "completed">>;
  sortedRows: NPSRow[];
  staleCount: number;
  subTab: "pending" | "completed";
  totalPages: number;
}) {
  return (
    <div className="mt-5">
    
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([['pending', 'Did not fill NPS', pendingRows.length], ['completed', 'NPS Collected', completedRows.length]] as const).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => { setSubTab(k); setSort({ key: 'visit', dir: 'desc' }); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-semibold border cursor-pointer transition-colors ${subTab === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
          >
            {label}
            <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded-full ${subTab === k ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{count}</span>
          </button>
        ))}
      </div>
    
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4 text-[13.5px] text-gray-500">
        {subTab === 'pending' ? (
          <>
            <span><b className="text-gray-900 font-bold">{pendingRows.length}</b> customers have not filled the NPS survey yet</span>
            <span>Stale (3+ days) <b className={`font-bold ${staleCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{staleCount}</b></span>
            <span>Avg wait <b className="text-gray-900 font-bold">{avgWait === '—' ? '—' : `${avgWait}d`}</b></span>
          </>
        ) : (
          <>
            <span><b className="text-gray-900 font-bold">{completedRows.length}</b> responses match filters</span>
            <span>NPS <b className={`font-bold ${compNps == null ? 'text-gray-900' : compNps >= 0 ? 'text-green-600' : 'text-red-600'}`}>{compNps == null ? '—' : fmtSigned(compNps)}</b></span>
            <span>Avg score <b className="text-gray-900 font-bold">{compAvg}</b></span>
            <span>Response rate <b className="text-gray-900 font-bold">{cur.responseRate == null ? '—' : `${cur.responseRate}%`}</b></span>
          </>
        )}
      </div>
    
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <SortHead sort={sort} toggleSort={toggleSort} label="Name" k="name" />
              <SortHead sort={sort} toggleSort={toggleSort} label="Phone" k="contact" />
              <SortHead sort={sort} toggleSort={toggleSort} label="Store" k="store" />
              <SortHead sort={sort} toggleSort={toggleSort} label="BM" k="bm" />
              <SortHead sort={sort} toggleSort={toggleSort} label="Visit Date" k="visit" />
              {subTab === 'pending' ? (
                <SortHead sort={sort} toggleSort={toggleSort} label="Waiting" k="waiting" />
              ) : (
                <>
                  <SortHead sort={sort} toggleSort={toggleSort} label="Result" k="score" />
                  <SortHead sort={sort} toggleSort={toggleSort} label="Understood" k="understood" />
                  <th className="px-5 py-3">Reasons</th>
                  <th className="px-5 py-3">Comment</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => (
              <tr key={r.id} onClick={() => setActive(r)}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-5 py-3.5 text-[14px] font-semibold text-gray-900">{r.name || '—'}</td>
                <td className="px-5 py-3.5 text-[14px] text-gray-600">{fmtPhone(r.contact)}</td>
                <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.store || '—'}</td>
                <td className="px-5 py-3.5 text-[14px] text-gray-600">{r.bm || '—'}</td>
                <td className="px-5 py-3.5 text-[14px] text-gray-600 whitespace-nowrap">{fmtDate(r.visit_date)} <span className="text-gray-400">· {r.time}</span></td>
                {subTab === 'pending' ? (
                  <td className="px-5 py-3.5"><WaitChip visitDate={r.visit_date} /></td>
                ) : (
                  <>
                    <td className="px-5 py-3.5"><ResultPill score={r.score} /></td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold ${r.understood ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.understood ? 'Yes' : 'No'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {r.better && r.better.length ? (
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {r.better.map(b => <span key={b} className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{b}</span>)}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-gray-600 max-w-[220px] truncate" title={r.remark || ''}>{r.remark || <span className="text-gray-300">—</span>}</td>
                  </>
                )}
              </tr>
            ))}
            {!loading && sortedRows.length === 0 && (
              <tr><td colSpan={subTab === 'pending' ? 6 : 9} className="px-5 py-10 text-center text-[13px] text-gray-400">No {subTab === 'pending' ? 'pending visits' : 'responses'} for this filter.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={subTab === 'pending' ? 6 : 9} className="px-5 py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            )}
          </tbody>
        </table>
        </div>
        {sortedRows.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-[13px] text-gray-500">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
