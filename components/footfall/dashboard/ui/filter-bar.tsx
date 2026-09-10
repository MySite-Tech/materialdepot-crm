'use client';

import { FootfallDashboardData, FootfallNoCartPage, FootfallNonConvertedPage } from '../../../../lib/api/dashboards';
import { CategoryOption } from '../../../../lib/api/dashboards/weekly-funnel';
import { DateRange } from '../types';
import { BMFilterChip, DateChip, FilterChip } from './chips';
import { Dispatch, SetStateAction } from 'react';

export function FootfallFilterBar({ bmFilter, bmRows, branchFilter, branchOptions, categoryFilter, categoryOptions, data, dateRange, exportOpen, exportSections, exporting, handleExportCsv, hasFilters, loading, monthEnd, monthStart, ncData, ncData2, setBmFilter, setBranchFilter, setCategoryFilter, setDateRange, setExportOpen, setExportSections }: {
  bmFilter: string[];
  bmRows: { name: string; contact: string; }[];
  branchFilter: string[];
  branchOptions: string[];
  categoryFilter: string[];
  categoryOptions: CategoryOption[];
  data: FootfallDashboardData | null;
  dateRange: DateRange;
  exportOpen: boolean;
  exportSections: { byBranch: boolean; byBm: boolean; cartNotConverted: boolean; noCart: boolean; };
  exporting: boolean;
  handleExportCsv: () => Promise<void>;
  hasFilters: string | boolean;
  loading: boolean;
  monthEnd: string;
  monthStart: string;
  ncData: FootfallNonConvertedPage | null;
  ncData2: FootfallNoCartPage | null;
  setBmFilter: Dispatch<SetStateAction<string[]>>;
  setBranchFilter: Dispatch<SetStateAction<string[]>>;
  setCategoryFilter: Dispatch<SetStateAction<string[]>>;
  setDateRange: Dispatch<SetStateAction<DateRange>>;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
  setExportSections: Dispatch<SetStateAction<{ byBranch: boolean; byBm: boolean; cartNotConverted: boolean; noCart: boolean; }>>;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
      <FilterChip label="Branch" options={branchOptions} selected={branchFilter}
        onChange={v => { setBranchFilter(v); setBmFilter([]); }} color={{ active: '#3B82F6' }} />
      <BMFilterChip selected={bmFilter} onChange={setBmFilter} options={bmRows} color={{ active: '#8B5CF6' }} />
      <DateChip label="Date Range" value={dateRange} onChange={setDateRange} color={{ active: '#F59E0B' }} />
      <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={categoryFilter} onChange={setCategoryFilter} color={{ active: '#10B981' }} searchable />
      {hasFilters && (
        <button
          onClick={() => {
            setBranchFilter([]);
            setBmFilter([]);
            setDateRange({ from: monthStart, to: monthEnd });
            setCategoryFilter([]);
          }}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all"
        >
          ✕ Clear
        </button>
      )}
      <div className="relative ml-auto">
        <button
          onClick={() => setExportOpen(o => !o)}
          disabled={loading || !data}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {exporting
            ? <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          }
          Export CSV
          <span className="text-[10px] opacity-60">▾</span>
        </button>
        {exportOpen && (
          <>
            <div className="fixed inset-0 z-[50]" onClick={() => setExportOpen(false)} />
            <div className="absolute top-full right-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[220px] p-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Include in export</div>
              {([
                { key: 'byBranch' as const,         label: 'By Branch' },
                { key: 'byBm' as const,             label: 'By BM' },
                { key: 'cartNotConverted' as const, label: `Cart Not Converted${ncData ? ` (${ncData.count})` : ''}` },
                { key: 'noCart' as const,           label: `No Cart Created${ncData2 ? ` (${ncData2.count})` : ''}` },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-[12px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={exportSections[key]}
                    onChange={e => setExportSections(s => ({ ...s, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={async () => { setExportOpen(false); await handleExportCsv(); }}
                disabled={exporting || !Object.values(exportSections).some(Boolean)}
                className="mt-2 w-full px-3 py-1.5 rounded-md text-[12px] font-semibold cursor-pointer bg-[#EAB308] text-black hover:bg-[#D4A107] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Download CSV
              </button>
            </div>
          </>
        )}
      </div>
      <span className="flex items-center gap-2 text-[11px] text-gray-400 font-mono shrink-0">
        {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
        {data ? `${data.footfall_users?.toLocaleString()} clients` : '—'}
      </span>
    </div>
  );
}
