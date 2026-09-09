'use client';

import { makeSummaryRows } from './rows';

import { BMFilterChip, CartValueRangeChip, DateRangeChip, DaysRangeChip, FilterChip } from './chips';
import { DETAIL_MAX_PAGES, DETAIL_PAGE_SIZE, LOST_REASON_OPTIONS } from '../constants/order-lost';
import { BranchSummary, Props } from '../types/order-lost';
import { daysBetween, emptyGroups, emptyReasons, fmtDetailDate, fmtFull, normalizeReason, pct, triggerDownload } from '../utils/order-lost';
import { AvailableBM, CRMLeadRow, CategoryOption, OrderLostBranchSummary, fetchAvailableBMs, fetchCRMLeads, fetchCategoryOptions, fetchOrderLostSummary } from '@/lib/mockApi';
import { Download } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function OrderLostDashboard({ branches, allowedBranches }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptionsKey = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ').join(',');
  const branchOptions = useMemo(() => (branchOptionsKey ? branchOptionsKey.split(',') : []), [branchOptionsKey]);

  const [sBranch, setSBranch] = useState<string[]>([]);
  const [sBm, setSBm] = useState<string[]>([]);
  const [sCategory, setSCategory] = useState<string[]>([]);
  const [sCartGt, setSCartGt] = useState<string>('');
  const [sCartLt, setSCartLt] = useState<string>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  const [dBranch, setDBranch] = useState<string[]>([]);
  const [dBm, setDBm] = useState<string[]>([]);
  const [dCategory, setDCategory] = useState<string[]>([]);
  const [dCartGt, setDCartGt] = useState<string>('');
  const [dCartLt, setDCartLt] = useState<string>('');
  const [lostReasonFilter, setLostReasonFilter] = useState<string[]>([]);
  const [lostFrom, setLostFrom] = useState('');
  const [lostTo, setLostTo] = useState('');
  const [dDaysGt, setDDaysGt] = useState<string>('');
  const [dDaysLt, setDDaysLt] = useState<string>('');

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [bmList, setBmList] = useState<AvailableBM[]>([]);

  const [summary, setSummary] = useState<BranchSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [detail, setDetail] = useState<CRMLeadRow[]>([]);
  const [detailCount, setDetailCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailPage, setDetailPage] = useState(1);

  const toggleExpand = (key: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const summaryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  const resolveBranches = (filter: string[]) => {
    if (filter.length) return isRestricted ? filter.filter(b => branchOptions.includes(b)) : filter;
    return branchOptions;
  };

  const sEffectiveBranches = useMemo(() => resolveBranches(sBranch), [sBranch, isRestricted, branchOptions]);
  const sBranchesParam = sEffectiveBranches.join(',');
  const sBmParam = sBm.length ? sBm.join(',') : undefined;
  const sCategoryParam = sCategory.length ? sCategory.join(',') : undefined;
  const sCartGtNum = sCartGt ? Number(sCartGt) : undefined;
  const sCartLtNum = sCartLt ? Number(sCartLt) : undefined;

  const dEffectiveBranches = useMemo(() => resolveBranches(dBranch), [dBranch, isRestricted, branchOptions]);
  const dBranchesParam = dEffectiveBranches.join(',');

  const detailBranchParam = (dEffectiveBranches.length && dEffectiveBranches.length < branchOptions.length)
    ? dBranchesParam : '';
  const dBmParam = dBm.length ? dBm.join(',') : undefined;
  const dCategoryParam = dCategory.length ? dCategory.join(',') : undefined;
  const dCartGtNum = dCartGt ? Number(dCartGt) : undefined;
  const dCartLtNum = dCartLt ? Number(dCartLt) : undefined;

  useEffect(() => {
    const all = branchOptions.join(',');
    fetchAvailableBMs(all ? all.split(',') : undefined)
      .then(setBmList).catch(() => setBmList([]));
  }, [branchOptionsKey]);

  const detailQuery = useMemo(() => ({
    status: 'Order Lost' as const,
    branch: detailBranchParam || undefined,
    bm: dBmParam,
    category: dCategoryParam,
    cartValueGt: dCartGtNum,
    cartValueLt: dCartLtNum,
    lostFrom: lostFrom || undefined,
    lostTo: lostTo || undefined,
    sortBy: 'createdAt' as const,
    sortDir: 'desc' as const,
  }), [detailBranchParam, dBmParam, dCategoryParam, dCartGtNum, dCartLtNum, lostFrom, lostTo]);

  useEffect(() => {
    if (summaryDebounce.current) clearTimeout(summaryDebounce.current);
    summaryDebounce.current = setTimeout(() => {
      setSummaryLoading(true);
      fetchOrderLostSummary({
        branch: sBranchesParam ? sBranchesParam.split(',') : undefined,
        bm: sBmParam ? sBmParam.split(',') : undefined,
        category: sCategoryParam ? sCategoryParam.split(',') : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        cartValueGt: sCartGtNum,
        cartValueLt: sCartLtNum,
      })
        .then((rows: OrderLostBranchSummary[]) => setSummary(rows as BranchSummary[]))
        .catch(() => setSummary([]))
        .finally(() => setSummaryLoading(false));
    }, 400);
    return () => { if (summaryDebounce.current) clearTimeout(summaryDebounce.current); };
  }, [sBranchesParam, sBmParam, sCategoryParam, createdFrom, createdTo, sCartGtNum, sCartLtNum]);

  useEffect(() => { setDetailPage(1); }, [detailQuery]);

  const [detailTotalPages, setDetailTotalPages] = useState(1);
  useEffect(() => {
    if (detailDebounce.current) clearTimeout(detailDebounce.current);
    detailDebounce.current = setTimeout(() => {
      setDetailLoading(true);
      fetchCRMLeads({ page: detailPage, pageSize: DETAIL_PAGE_SIZE, ...detailQuery })
        .then(res => { setDetail(res.results); setDetailCount(res.count); setDetailTotalPages(res.totalPages || 1); })
        .catch(() => { setDetail([]); setDetailCount(0); setDetailTotalPages(1); })
        .finally(() => setDetailLoading(false));
    }, 400);
    return () => { if (detailDebounce.current) clearTimeout(detailDebounce.current); };
  }, [detailQuery, detailPage]);

  const totals = useMemo<BranchSummary>(() => {
    const acc: BranchSummary = {
      branch: 'TOTAL', totalCount: 0, totalValue: 0, activeCount: 0, activeValue: 0,
      wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0,
      groupCount: emptyGroups(), groupValue: emptyGroups(),
      reasonCount: emptyReasons(), reasonValue: emptyReasons(),
    };
    for (const b of summary) {
      acc.totalCount += b.totalCount; acc.totalValue += b.totalValue;
      acc.activeCount += b.activeCount; acc.activeValue += b.activeValue;
      acc.wonCount += b.wonCount; acc.wonValue += b.wonValue;
      acc.lostCount += b.lostCount; acc.lostValue += b.lostValue;
      (['Category', 'Retail', 'Other'] as const).forEach(g => {
        acc.groupCount[g] += b.groupCount[g];
        acc.groupValue[g] += b.groupValue[g];
        Object.entries(b.reasonCount?.[g] || {}).forEach(([k, v]) => {
          acc.reasonCount![g][k] = (acc.reasonCount![g][k] || 0) + v;
        });
        Object.entries(b.reasonValue?.[g] || {}).forEach(([k, v]) => {
          acc.reasonValue![g][k] = (acc.reasonValue![g][k] || 0) + v;
        });
      });
    }
    return acc;
  }, [summary]);

  const dDaysGtNum = dDaysGt ? Number(dDaysGt) : undefined;
  const dDaysLtNum = dDaysLt ? Number(dDaysLt) : undefined;
  const matchesDetailClientFilters = (r: CRMLeadRow, wanted: Set<string> | null): boolean => {
    if (wanted && !wanted.has(normalizeReason(r.lostReason))) return false;
    if (dDaysGtNum != null || dDaysLtNum != null) {
      const days = daysBetween(r.createdAt, r.lostMarkDate);
      if (days == null) return false;
      if (dDaysGtNum != null && days < dDaysGtNum) return false;
      if (dDaysLtNum != null && days > dDaysLtNum) return false;
    }
    return true;
  };
  const hasClientFilter = lostReasonFilter.length > 0 || dDaysGtNum != null || dDaysLtNum != null;
  const filteredDetail = useMemo(() => {
    if (!hasClientFilter) return detail;
    const wanted = lostReasonFilter.length ? new Set(lostReasonFilter.map(normalizeReason)) : null;
    return detail.filter(r => matchesDetailClientFilters(r, wanted));
  }, [detail, lostReasonFilter, dDaysGtNum, dDaysLtNum]);

  const latestComment = (r: CRMLeadRow): string => {
    if (!r.remarks?.length) return '';
    const sorted = [...r.remarks].sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return sorted[0]?.text ?? '';
  };

  const resetSummary = () => {
    setSBranch([]); setSBm([]); setSCategory([]); setSCartGt(''); setSCartLt(''); setCreatedFrom(''); setCreatedTo('');
  };
  const resetDetail = () => {
    setDBranch([]); setDBm([]); setDCategory([]); setDCartGt(''); setDCartLt('');
    setLostReasonFilter([]); setLostFrom(''); setLostTo(''); setDDaysGt(''); setDDaysLt('');
  };

  const downloadSummaryCsv = () => {
    const head = ['Metric', ...summary.map(b => b.branch), 'TOTAL'];
    const cols = [...summary, totals];
    const rows: string[][] = [head];
    const line = (label: string, fn: (b: BranchSummary) => string) => rows.push([label, ...cols.map(fn)]);
    line('Total Leads', b => String(b.totalCount));
    line('Active Leads', b => String(b.activeCount));
    line('Orders Won', b => String(b.wonCount));
    line('Total Orders Lost', b => String(b.lostCount));
    line('Category Issues', b => String(b.groupCount.Category));
    line('Retail Issues', b => String(b.groupCount.Retail));
    line('Other Issues', b => String(b.groupCount.Other));
    line('Total Sales Value', b => String(Math.round(b.wonValue)));
    line('Pipeline Value', b => String(Math.round(b.activeValue)));
    line('Total Value Lost', b => String(Math.round(b.lostValue)));
    line('Category Issues — Value', b => String(Math.round(b.groupValue.Category)));
    line('Retail Issues — Value', b => String(Math.round(b.groupValue.Retail)));
    line('Other Issues — Value', b => String(Math.round(b.groupValue.Other)));
    triggerDownload(rows, 'order-lost-summary.csv');
  };

  const downloadDetailCsv = async () => {
    setCsvBusy(true);
    try {
      const all: CRMLeadRow[] = [];
      for (let page = 1; page <= DETAIL_MAX_PAGES; page++) {
        const res = await fetchCRMLeads({ page, pageSize: DETAIL_PAGE_SIZE, ...detailQuery });
        all.push(...res.results);
        if (page >= (res.totalPages || 1)) break;
      }
      const wanted = lostReasonFilter.length ? new Set(lostReasonFilter.map(normalizeReason)) : null;
      const rowsData = (wanted || dDaysGtNum != null || dDaysLtNum != null)
        ? all.filter(r => matchesDetailClientFilters(r, wanted))
        : all;
      const head = ['Client Name', 'Phone', 'Store', 'BM', 'Categories', 'Cart Value', 'Cart Created', 'Lost Mark Date', 'Days in Pipeline', 'Lost Reason', 'Comments', 'Property Type'];
      const rows: string[][] = [head];
      for (const r of rowsData) {
        const days = daysBetween(r.createdAt, r.lostMarkDate);
        rows.push([
          r.clientName ?? '', r.clientPhone ?? '', r.branch ?? '', r.assignedTo ?? '',
          r.cartItems ?? '', String(Math.round(r.cartValue || 0)),
          fmtDetailDate(r.createdAt), fmtDetailDate(r.lostMarkDate),
          days != null ? `${days}d` : '—', r.lostReason ?? '', latestComment(r), r.propertyType ?? '',
        ]);
      }
      triggerDownload(rows, 'lost-clients-detail.csv');
    } finally {
      setCsvBusy(false);
    }
  };

  const cols = summary;

  const { CountRow, ValueRow, GroupRows } = makeSummaryRows({ cols, totals, expanded, toggleExpand });

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6">

      <section>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Summary Table</h2>
            <p className="text-[11px] text-gray-400">Total Leads = deal-ticket leads (one row per deal ticket) · date range applies to <span className="font-semibold text-gray-500">Cart Created</span> · Store, BM &amp; Category filters apply</p>
          </div>
          <button onClick={downloadSummaryCsv}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-black">
            <Download size={13} /> Download CSV
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm mb-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
          <FilterChip label="Store" options={branchOptions} selected={sBranch}
            onChange={v => { setSBranch(v); setSBm([]); }} color="#3B82F6" />
          <BMFilterChip selected={sBm} onChange={setSBm} options={bmList} color="#8B5CF6" />
          <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={sCategory}
            onChange={setSCategory} color="#10B981" />
          <CartValueRangeChip gt={sCartGt} lt={sCartLt}
            onChange={(g, l) => { setSCartGt(g); setSCartLt(l); }} color="#F59E0B" />
          <DateRangeChip from={createdFrom} to={createdTo} onChange={(f, t) => { setCreatedFrom(f); setCreatedTo(t); }}
            label="Cart Created" color="#0EA5E9" />
          <button onClick={resetSummary} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">Reset all</button>
        </div>
        <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {summaryLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Metric</th>
                  {cols.map(b => (
                    <th key={b.branch} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{b.branch}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/60">Total</th>
                </tr>
              </thead>
              <tbody>
                {!summaryLoading && cols.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-10 text-center text-[13px] text-gray-400">No data for the selected filters</td></tr>
                )}
                {cols.length > 0 && <>
                  <tr className="bg-gray-50"><td colSpan={cols.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Orders — Count</td></tr>
                  <CountRow label="Total Leads" value={b => b.totalCount} />
                  <CountRow label="Active Leads" value={b => b.activeCount} sub={b => pct(b.activeCount, b.totalCount)} />
                  <CountRow label="Orders Won" value={b => b.wonCount} sub={b => pct(b.wonCount, b.totalCount)} />
                  <CountRow label="Total Orders Lost" value={b => b.lostCount} sub={b => pct(b.lostCount, b.totalCount)} danger />
                  <GroupRows group="Category" label="Category Issues" kind="count" />
                  <GroupRows group="Retail" label="Retail Issues" kind="count" />
                  <GroupRows group="Other" label="Other Issues" kind="count" />

                  <tr className="bg-gray-50"><td colSpan={cols.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Value (₹) — Cart Value</td></tr>
                  <ValueRow label="Total Sales Value" value={b => b.wonValue} />
                  <ValueRow label="Pipeline Value" value={b => b.activeValue} />
                  <ValueRow label="Total Value Lost" value={b => b.lostValue} danger />
                  <GroupRows group="Category" label="Category Issues — Value" kind="value" />
                  <GroupRows group="Retail" label="Retail Issues — Value" kind="value" />
                  <GroupRows group="Other" label="Other Issues — Value" kind="value" />
                </>}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">% shares exclude &ldquo;Order Closed Already&rdquo; (non-loss). Values in Indian number format (₹).</p>
      </section>

      <section>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Lost Clients Detail</h2>
            <p className="text-[11px] text-gray-400">Date range applies to <span className="font-semibold text-gray-500">Lost Mark Date</span> — clients marked lost in the selected window ·
              {' '}{detailLoading ? 'loading…' : hasClientFilter ? `${filteredDetail.length.toLocaleString('en-IN')} clients on this page` : `${detailCount.toLocaleString('en-IN')} clients`}</p>
          </div>
          <button onClick={downloadDetailCsv} disabled={csvBusy || detailLoading}
            className="flex items-center gap-1.5 bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-black disabled:opacity-50">
            <Download size={13} /> {csvBusy ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm mb-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
          <FilterChip label="Store" options={branchOptions} selected={dBranch}
            onChange={v => { setDBranch(v); setDBm([]); }} color="#3B82F6" />
          <BMFilterChip selected={dBm} onChange={setDBm} options={bmList} color="#8B5CF6" />
          <FilterChip label="Category" options={categoryOptions.map(c => c.name)} selected={dCategory}
            onChange={setDCategory} color="#10B981" />
          <CartValueRangeChip gt={dCartGt} lt={dCartLt}
            onChange={(g, l) => { setDCartGt(g); setDCartLt(l); }} color="#F59E0B" />
          <FilterChip label="Lost Reason" options={LOST_REASON_OPTIONS} selected={lostReasonFilter}
            onChange={setLostReasonFilter} color="#EF4444" />
          <DateRangeChip from={lostFrom} to={lostTo} onChange={(f, t) => { setLostFrom(f); setLostTo(t); }}
            label="Lost Mark Date" color="#DC2626" />
          <DaysRangeChip gt={dDaysGt} lt={dDaysLt}
            onChange={(g, l) => { setDDaysGt(g); setDDaysLt(l); }} color="#0EA5E9" />
          <button onClick={resetDetail} className="ml-auto text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">Reset all</button>
        </div>
        {!detailLoading && (lostReasonFilter.length > 0 || dDaysGtNum != null || dDaysLtNum != null) && (
          <div className="mb-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
            {lostReasonFilter.length > 0 && (dDaysGtNum != null || dDaysLtNum != null) ? 'Lost Reason and Days in Pipeline filters are' : lostReasonFilter.length > 0 ? 'Lost Reason filter is' : 'Days in Pipeline filter is'} applied to this page only — download the CSV for the full filtered list.
          </div>
        )}
        <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {detailLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-white z-[1]">
                <tr className="border-b border-gray-200">
                  {['#', 'Client Name', 'Phone', 'Store', 'BM', 'Categories', 'Cart Value', 'Cart Created', 'Lost Mark Date', 'Days in Pipeline', 'Lost Reason', 'Comments', 'Property Type'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!detailLoading && filteredDetail.length === 0 && (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-[13px] text-gray-400">No lost clients for the selected filters</td></tr>
                )}
                {filteredDetail.map((r, i) => {
                  const days = daysBetween(r.createdAt, r.lostMarkDate);
                  const cats = (r.cartItems || '').split(',').map(s => s.trim()).filter(Boolean);
                  return (
                    <tr key={`${r.id || 'row'}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                      <td className="px-3 py-2.5 text-gray-400 font-mono">{(detailPage - 1) * DETAIL_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{r.clientName || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-500 whitespace-nowrap">{r.clientPhone || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.branch || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.assignedTo || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {cats.length ? cats.map((c, ci) => (
                            <span key={ci} className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded">{c}</span>
                          )) : <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{fmtFull(r.cartValue || 0)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDetailDate(r.createdAt)}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDetailDate(r.lostMarkDate)}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{days != null ? `${days}d` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">{r.lostReason || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 max-w-[280px]"><div className="line-clamp-3">{latestComment(r) || '—'}</div></td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.propertyType || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!detailLoading && detailCount > 0 && (
          <div className="flex items-center justify-between mt-2 text-[12px] text-gray-500">
            <span>
              {hasClientFilter
                ? `Showing ${filteredDetail.length.toLocaleString('en-IN')} matching on this page`
                : `Showing ${((detailPage - 1) * DETAIL_PAGE_SIZE + 1).toLocaleString('en-IN')}–${Math.min(detailPage * DETAIL_PAGE_SIZE, detailCount).toLocaleString('en-IN')} of ${detailCount.toLocaleString('en-IN')}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setDetailPage(p => Math.max(1, p - 1))} disabled={detailPage <= 1}
                className="px-2.5 py-1 rounded-md border border-gray-200 bg-white cursor-pointer hover:border-gray-400 disabled:opacity-40 disabled:cursor-default">Prev</button>
              <span className="px-2 tabular-nums">Page {detailPage} / {detailTotalPages}</span>
              <button onClick={() => setDetailPage(p => Math.min(detailTotalPages, p + 1))} disabled={detailPage >= detailTotalPages}
                className="px-2.5 py-1 rounded-md border border-gray-200 bg-white cursor-pointer hover:border-gray-400 disabled:opacity-40 disabled:cursor-default">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
