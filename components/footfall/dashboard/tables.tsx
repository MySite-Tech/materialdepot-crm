'use client';

import { BM_PAGE_SIZE, FUNNEL_COLS, PCT_COLS } from '../constants/footfall';
import { fmtPct } from '../utils/footfall';
import { FootfallBMRow, FootfallBranchRow } from '@/lib/mockApi';

function PctBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / (max || 100)) * 100, 100);
  const color = value >= 50 ? '#22C55E' : value >= 25 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="font-semibold" style={{ color, minWidth: 42, textAlign: 'right' }}>{fmtPct(value)}</span>
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function FunnelTable<T extends FootfallBMRow | FootfallBranchRow>({
  title,
  rows,
  nameKey,
  searchState,
  page: pageProp,
  setPage,
}: {
  title: string;
  rows: T[];
  nameKey: keyof T;
  searchState?: [string, (v: string) => void];
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [search, setSearch] = searchState ?? ['', () => {}];
  const filtered = search.trim()
    ? rows.filter(r => String(r[nameKey]).toLowerCase().includes(search.trim().toLowerCase()))
    : rows;
  const totalPages = Math.ceil(filtered.length / BM_PAGE_SIZE) || 1;
  const page = Math.min(pageProp, totalPages - 1);
  const pageRows = filtered.slice(page * BM_PAGE_SIZE, (page + 1) * BM_PAGE_SIZE);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <span className="text-[13px] font-bold text-gray-800 shrink-0">{title}</span>
        {searchState && (
          <input
            type="text" placeholder={`Search ${title}…`} value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="flex-1 max-w-[220px] border border-gray-200 rounded px-2.5 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none focus:border-yellow-400 bg-white"
          />
        )}
        <span className="text-[11px] text-gray-400 ml-auto shrink-0">
          {search.trim() ? `${filtered.length} of ${rows.length}` : rows.length} rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 sm:px-5 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">{title}</th>
              {FUNNEL_COLS.map(c => (
                <th key={c.key} className="text-right px-3 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">{c.label}</th>
              ))}
              {PCT_COLS.map(c => (
                <th key={c.key} className="text-right px-3 py-2 font-semibold text-gray-400 text-[10px] uppercase tracking-wider whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageRows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[12px] text-gray-400">No results{search.trim() ? ` for "${search}"` : ''}</td></tr>
            )}
            {pageRows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 sm:px-5 py-2.5 font-medium text-gray-700">{String(row[nameKey])}</td>
                {FUNNEL_COLS.map(c => (
                  <td key={c.key} className={`px-3 py-2.5 text-right font-medium ${c.color}`}>
                    {((row[c.key] as number) ?? 0).toLocaleString()}
                  </td>
                ))}
                {PCT_COLS.map(c => (
                  <td key={c.key} className="px-3 py-2.5 text-right">
                    <PctBar value={(row[c.key] as number) ?? 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] text-gray-400">
            Showing {page * BM_PAGE_SIZE + 1}–{Math.min((page + 1) * BM_PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">First</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <span className="text-[11px] text-gray-500 px-2">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Next</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 hover:bg-gray-50">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
