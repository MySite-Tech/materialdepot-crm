'use client';

import { FootfallFilterBar } from './filter-bar';
import { FootfallNoCartTable } from './no-cart-table';
import { FootfallNonConvertedTable } from './non-converted-table';
import { FunnelTable } from './tables';
import { DateRange, Props } from '../types/footfall';
import { csvRow, downloadCsv, fmtPct } from '../utils/footfall';
import { CategoryOption, FootfallDashboardData, FootfallFilters, FootfallNoCartPage, FootfallNonConvertedPage, fetchAvailableBMs, fetchCategoryOptions, fetchFootfallDashboard, fetchFootfallNoCart, fetchFootfallNonConverted } from '@/lib/mockApi';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function FootfallDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [dateRange, setDateRange] = useState<DateRange>({ from: monthStart, to: monthEnd });
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [bmPage, setBmPage] = useState(0);
  const [bmSearch, setBmSearch] = useState('');

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  const [data, setData] = useState<FootfallDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ncData, setNcData] = useState<FootfallNonConvertedPage | null>(null);
  const [ncLoading, setNcLoading] = useState(false);
  const [ncPage, setNcPage] = useState(1);
  const [ncSearch, setNcSearch] = useState('');
  const ncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NC_PAGE_SIZE = 10;

  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSections, setExportSections] = useState({
    byBranch: true,
    byBm: true,
    cartNotConverted: true,
    noCart: true,
  });

  const [ncData2, setNcData2] = useState<FootfallNoCartPage | null>(null);
  const [ncLoading2, setNcLoading2] = useState(false);
  const [ncPage2, setNcPage2] = useState(1);
  const [ncSearch2, setNcSearch2] = useState('');
  const ncDebounceRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0 || dateRange.from || dateRange.to || categoryFilter.length > 0;

  const load = useCallback((filters: FootfallFilters) => {
    setLoading(true);
    fetchFootfallDashboard(filters)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const loadNonConverted = useCallback((filters: FootfallFilters, page: number, q: string) => {
    setNcLoading(true);
    fetchFootfallNonConverted({ ...filters, page, pageSize: NC_PAGE_SIZE, q: q || undefined })
      .then(setNcData)
      .catch(() => setNcData(null))
      .finally(() => setNcLoading(false));
  }, []);

  const loadNoCart = useCallback((filters: FootfallFilters, page: number, q: string) => {
    setNcLoading2(true);
    fetchFootfallNoCart({ ...filters, page, pageSize: NC_PAGE_SIZE, q: q || undefined })
      .then(setNcData2)
      .catch(() => setNcData2(null))
      .finally(() => setNcLoading2(false));
  }, []);

  const getEffectiveBranches = useCallback(() =>
    isRestricted
      ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
      : (branchFilter.length > 0 ? branchFilter : undefined),
  [isRestricted, branchFilter, allowedBranches]);

  useEffect(() => {
    setLoading(true);
    setNcLoading(true);
    setNcLoading2(true);
    setNcData(null);
    setNcData2(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      };
      setBmPage(0);
      setNcPage(1);
      setNcSearch('');
      setNcPage2(1);
      setNcSearch2('');
      load(filters);
      loadNonConverted(filters, 1, '');
      loadNoCart(filters, 1, '');
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmFilter, dateRange, categoryFilter, load, loadNonConverted, loadNoCart, getEffectiveBranches]);

  useEffect(() => {
    const filters: FootfallFilters = {
      branch: getEffectiveBranches(),
      bm: bmFilter.length > 0 ? bmFilter : undefined,
      dateFrom: dateRange.from || undefined,
      dateTo: dateRange.to || undefined,
      category: categoryFilter.length ? categoryFilter : undefined,
    };
    loadNonConverted(filters, ncPage, ncSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncPage]);

  useEffect(() => {
    const filters: FootfallFilters = {
      branch: getEffectiveBranches(),
      bm: bmFilter.length > 0 ? bmFilter : undefined,
      dateFrom: dateRange.from || undefined,
      dateTo: dateRange.to || undefined,
      category: categoryFilter.length ? categoryFilter : undefined,
    };
    loadNoCart(filters, ncPage2, ncSearch2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncPage2]);

  useEffect(() => {
    if (ncDebounceRef.current) clearTimeout(ncDebounceRef.current);
    ncDebounceRef.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      };
      setNcPage(1);
      loadNonConverted(filters, 1, ncSearch);
    }, 350);
    return () => { if (ncDebounceRef.current) clearTimeout(ncDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncSearch]);

  useEffect(() => {
    if (ncDebounceRef2.current) clearTimeout(ncDebounceRef2.current);
    ncDebounceRef2.current = setTimeout(() => {
      const filters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      };
      setNcPage2(1);
      loadNoCart(filters, 1, ncSearch2);
    }, 350);
    return () => { if (ncDebounceRef2.current) clearTimeout(ncDebounceRef2.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncSearch2]);

  const [bmRows, setBmRows] = useState<{ name: string; contact: string }[]>([]);
  const branchKey = (isRestricted
    ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
    : branchFilter
  ).join(',');
  useEffect(() => {
    const effective = branchKey ? branchKey.split(',') : undefined;
    fetchAvailableBMs(effective).then(setBmRows).catch(() => setBmRows([]));
  }, [branchKey]);

  type SummaryCardKey = 'footfall_users' | 'cart_users' | 'pi_users' | 'order_users';
  type SummaryPctKey = 'cart_pct' | 'pi_pct' | 'order_pct';
  const SUMMARY_CARDS: Array<{ key: SummaryCardKey; label: string; color: string; pctKey?: SummaryPctKey }> = [
    { key: 'footfall_users', label: 'Footfall Clients',  color: 'text-gray-900' },
    { key: 'cart_users',     label: 'Cart Clients',      color: 'text-blue-600',   pctKey: 'cart_pct' },
    { key: 'pi_users',       label: 'PI Clients',        color: 'text-purple-600', pctKey: 'pi_pct' },
    { key: 'order_users',    label: 'Order Clients',     color: 'text-green-600',  pctKey: 'order_pct' },
  ];

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const baseFilters: FootfallFilters = {
        branch: getEffectiveBranches(),
        bm: bmFilter.length > 0 ? bmFilter : undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
        category: categoryFilter.length ? categoryFilter : undefined,
      };
      const ncTotal = ncData?.count ?? 0;
      const nc2Total = ncData2?.count ?? 0;
      const BIG = 10000;
      const [ncAll, nc2All] = await Promise.all([
        exportSections.cartNotConverted && ncTotal > 0
          ? fetchFootfallNonConverted({ ...baseFilters, page: 1, pageSize: Math.min(ncTotal, BIG), q: ncSearch || undefined })
          : Promise.resolve(null),
        exportSections.noCart && nc2Total > 0
          ? fetchFootfallNoCart({ ...baseFilters, page: 1, pageSize: Math.min(nc2Total, BIG), q: ncSearch2 || undefined })
          : Promise.resolve(null),
      ]);

      const lines: string[] = [];

      if (exportSections.byBranch && data?.by_branch?.length) {
        lines.push('By Branch');
        lines.push(csvRow(['Branch', 'Footfall', 'Cart', 'PI', 'Order', 'Cart Conv%', 'PI Conv%', 'Order Conv%']));
        data.by_branch.forEach(r => {
          lines.push(csvRow([r.branch, r.footfall_users, r.cart_users, r.pi_users, r.order_users,
            r.cart_pct.toFixed(1), r.pi_pct.toFixed(1), r.order_pct.toFixed(1)]));
        });
        lines.push('');
      }

      if (exportSections.byBm && data?.by_bm?.length) {
        lines.push('By BM');
        lines.push(csvRow(['BM', 'Footfall', 'Cart', 'PI', 'Order', 'Cart Conv%', 'PI Conv%', 'Order Conv%']));
        data.by_bm.forEach(r => {
          lines.push(csvRow([r.bm_name, r.footfall_users, r.cart_users, r.pi_users, r.order_users,
            r.cart_pct.toFixed(1), r.pi_pct.toFixed(1), r.order_pct.toFixed(1)]));
        });
        lines.push('');
      }

      if (ncAll?.results?.length) {
        lines.push(`Cart Not Converted (${ncAll.count})`);
        lines.push(csvRow(['Name', 'Contact', 'BM']));
        ncAll.results.forEach(r => lines.push(csvRow([r.name, r.contact, r.bm])));
        lines.push('');
      }

      if (nc2All?.results?.length) {
        lines.push(`No Cart Created (${nc2All.count})`);
        lines.push(csvRow(['Name', 'Contact', 'BM']));
        nc2All.results.forEach(r => lines.push(csvRow([r.name, r.contact, r.bm])));
        lines.push('');
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`footfall-dashboard_${stamp}.csv`, lines.join('\n'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">

      <FootfallFilterBar
        bmFilter={bmFilter}
        bmRows={bmRows}
        branchFilter={branchFilter}
        branchOptions={branchOptions}
        categoryFilter={categoryFilter}
        categoryOptions={categoryOptions}
        data={data}
        dateRange={dateRange}
        exportOpen={exportOpen}
        exportSections={exportSections}
        exporting={exporting}
        handleExportCsv={handleExportCsv}
        hasFilters={hasFilters}
        loading={loading}
        monthEnd={monthEnd}
        monthStart={monthStart}
        ncData={ncData}
        ncData2={ncData2}
        setBmFilter={setBmFilter}
        setBranchFilter={setBranchFilter}
        setCategoryFilter={setCategoryFilter}
        setDateRange={setDateRange}
        setExportOpen={setExportOpen}
        setExportSections={setExportSections}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SUMMARY_CARDS.map(({ key, label, color, pctKey }) => {
          const val = data?.[key] ?? null;
          const pct = pctKey && data ? data[pctKey] : null;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
              {loading && !data
                ? <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                : <div className={`text-[26px] font-bold leading-tight ${color}`}>
                    {val === null ? '—' : (val as number).toLocaleString()}
                  </div>
              }
              {pct !== null && (
                <div className="text-[11px] text-gray-400 mt-0.5">{fmtPct(pct)} of footfall</div>
              )}
            </div>
          );
        })}
      </div>

      {(data?.by_branch?.length ?? 0) > 0 && (
        <FunnelTable title="By Branch" rows={data!.by_branch} nameKey="branch" page={bmPage} setPage={setBmPage} />
      )}

      {(data?.by_bm?.length ?? 0) > 0 && (
        <FunnelTable
          title="By BM"
          rows={data!.by_bm}
          nameKey="bm_name"
          searchState={[bmSearch, (v) => { setBmSearch(v); setBmPage(0); }]}
          page={bmPage}
          setPage={setBmPage}
        />
      )}

      {!loading && data && data.by_bm.length === 0 && data.by_branch.length === 0 && (
        <div className="text-center text-gray-400 text-[13px] py-10">No footfall records found for the selected filters.</div>
      )}

      <FootfallNonConvertedTable
        NC_PAGE_SIZE={NC_PAGE_SIZE}
        ncData={ncData}
        ncLoading={ncLoading}
        ncSearch={ncSearch}
        setNcPage={setNcPage}
        setNcSearch={setNcSearch}
      />

      <FootfallNoCartTable
        NC_PAGE_SIZE={NC_PAGE_SIZE}
        ncData2={ncData2}
        ncLoading2={ncLoading2}
        ncSearch2={ncSearch2}
        setNcPage2={setNcPage2}
        setNcSearch2={setNcSearch2}
      />
    </div>
  );
}
