'use client';

import { NpsOverviewTab } from './tabs/overview';
import { NpsTrackerTab } from './tabs/tracker';

import { C, Q3_OPTIONS } from './constants';
import { DateDropdown, MultiDropdown } from './ui/dropdowns';
import { SurveyModal } from './ui/survey';
import { CatFilter, NPSDashboardProps, SortKey, Understood } from './types';
import { Segmented } from './ui';
import { addDaysISO, bucketOf, catOf, computeMetrics, daysBetweenISO, daysSince, exportCSV, fmtDate, fmtPhone, npsOf, okBm, okCategory, okSearch, okUnderstood, presetRange, uniqueCustomers, uniqueReviews } from './utils';
import { NPSRow, fetchNPSTracker, submitNPS } from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function NPSDashboard({ branches = [], allowedBranches = [] }: NPSDashboardProps) {
  const branchOptions = allowedBranches.length > 0 ? allowedBranches : branches;

  const [tab, setTab] = useState<'tracker' | 'overview'>('tracker');
  const [stores, setStores] = useState<string[]>([]);
  const [bms, setBms] = useState<string[]>([]);
  const [preset, setPreset] = useState('last30');
  const [from, setFrom] = useState(presetRange('last30').from);
  const [to, setTo] = useState(presetRange('last30').to);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [understood, setUnderstood] = useState<Understood>('all');
  const [category, setCategory] = useState<CatFilter>('all');

  const [subTab, setSubTab] = useState<'pending' | 'completed'>('pending');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'visit', dir: 'desc' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [rows, setRows] = useState<NPSRow[]>([]);
  const [prevRows, setPrevRows] = useState<NPSRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<NPSRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveBranches = stores.length > 0
    ? stores
    : (allowedBranches.length > 0 ? allowedBranches : undefined);
  const branchKey = (effectiveBranches ?? []).join(',');

  const rangeLen = Math.max(1, daysBetweenISO(from, to) + 1);
  const prevTo = addDaysISO(from, -1);
  const prevFrom = addDaysISO(prevTo, -(rangeLen - 1));

  const loadRows = useCallback(() => {
    setLoading(true);
    fetchNPSTracker({ branches: branchKey ? branchKey.split(',') : undefined, from, to })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [branchKey, from, to]);

  useEffect(() => { loadRows(); }, [loadRows]);

  useEffect(() => {
    if (tab !== 'overview') return;
    let cancelled = false;
    fetchNPSTracker({ branches: branchKey ? branchKey.split(',') : undefined, from: prevFrom, to: prevTo })
      .then(d => { if (!cancelled) setPrevRows(d); })
      .catch(() => { if (!cancelled) setPrevRows([]); });
    return () => { cancelled = true; };
  }, [tab, branchKey, prevFrom, prevTo]);

  useEffect(() => { setPage(1); }, [subTab, debouncedSearch, understood, category, branchKey, from, to, bms.join(',')]);

  const handleSubmit = async (payload: { footfall_id: number; score: number | null; understood: boolean | null; better: string[]; remark: string }) => {
    await submitNPS(payload);
    setActive(null);
    loadRows();
  };

  const applyDate = (f: string, t: string, p: string) => { setFrom(f); setTo(t); setPreset(p); };
  const clearFilters = () => {
    setStores([]); setBms([]); setSearch(''); setUnderstood('all'); setCategory('all');
    applyDate(presetRange('last30').from, presetRange('last30').to, 'last30');
  };

  const bmOptions = useMemo(() => Array.from(new Set(rows.map(r => r.bm).filter(Boolean))).sort() as string[], [rows]);

  const base = useMemo(() => rows.filter(r => okSearch(r, debouncedSearch) && okBm(r, bms)), [rows, debouncedSearch, bms]);
  const analysis = useMemo(() => base.filter(r => okUnderstood(r, understood) && okCategory(r, category)), [base, understood, category]);

  const cur = useMemo(() => computeMetrics(base, understood, category), [base, understood, category]);
  const prev = useMemo(() => {
    const pb = prevRows.filter(r => okSearch(r, debouncedSearch) && okBm(r, bms));
    return computeMetrics(pb, understood, category);
  }, [prevRows, debouncedSearch, bms, understood, category]);

  const trend = useMemo(() => {
    const map: Record<string, NPSRow[]> = {};
    let guard = 0;
    for (let d = from; d <= to && guard < 400; d = addDaysISO(d, 1), guard++) map[d] = [];

    uniqueReviews(analysis).forEach(r => { if (map[r.visit_date]) map[r.visit_date].push(r); });
    return Object.keys(map).sort().map(d => ({ date: d.slice(5), nps: npsOf(map[d]), responses: map[d].length }));
  }, [analysis, from, to]);
  const trendHasData = trend.some(p => p.nps != null);

  const storeData = useMemo(() => {
    const names = Array.from(new Set(analysis.map(r => r.store).filter(Boolean))) as string[];
    return names.map(s => {
      const rs = analysis.filter(r => r.store === s);
      const comp = uniqueReviews(rs);
      return {
        store: s,
        nps: npsOf(rs),
        count: comp.length,
        promoter: comp.filter(r => catOf(r.score!) === 'promoter').length,
        passive: comp.filter(r => catOf(r.score!) === 'passive').length,
        detractor: comp.filter(r => catOf(r.score!) === 'detractor').length,
      };
    }).filter(d => d.count > 0);
  }, [analysis]);

  const storeNpsData = useMemo(
    () => storeData.map(d => ({ store: d.store, nps: d.nps ?? 0, count: d.count })).sort((a, b) => b.nps - a.nps),
    [storeData],
  );
  const mixData = useMemo(
    () => storeData.slice().sort((a, b) => {
      const at = a.promoter + a.passive + a.detractor, bt = b.promoter + b.passive + b.detractor;
      return (b.promoter - b.detractor) / (bt || 1) - (a.promoter - a.detractor) / (at || 1);
    }),
    [storeData],
  );

  const storeResponseData = useMemo(() => {
    const names = Array.from(new Set(base.map(r => r.store).filter(Boolean))) as string[];
    return names.map(s => {
      const rs = base.filter(r => r.store === s);
      const footfalls = uniqueCustomers(rs).length;
      const responses = uniqueReviews(rs).length;
      return {
        store: s,
        footfalls,
        responses,
        pending: footfalls - responses,
        rate: footfalls ? Math.round(responses / footfalls * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate || b.footfalls - a.footfalls);
  }, [base]);

  const responseTotals = useMemo(() => {
    const footfalls = uniqueCustomers(base).length;
    const responses = uniqueReviews(base).length;
    return { footfalls, responses, pending: footfalls - responses, rate: footfalls ? Math.round(responses / footfalls * 100) : 0 };
  }, [base]);

  const bmChartData = useMemo(() => {
    const names = Array.from(new Set(analysis.map(r => r.bm).filter(Boolean))) as string[];
    return names.map(n => {
      const rs = analysis.filter(r => r.bm === n);
      return { bm: n, nps: npsOf(rs) ?? 0, count: uniqueReviews(rs).length };
    }).filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 10).sort((a, b) => b.nps - a.nps);
  }, [analysis]);

  const dist = useMemo(() => {
    const comp = uniqueReviews(analysis);
    return Array.from({ length: 11 }, (_, s) => ({ score: s, count: comp.filter(r => r.score === s).length }));
  }, [analysis]);
  const distHasData = dist.some(d => d.count > 0);

  const reasonData = useMemo(() => {
    const noRows = uniqueCustomers(analysis.filter(r => r.status === 'submitted' && r.understood === false));
    const counts: Record<string, number> = {};
    Q3_OPTIONS.forEach(o => { counts[o] = 0; });
    noRows.forEach(r => (r.better || []).forEach(b => { if (b in counts) counts[b]++; }));
    const data = Q3_OPTIONS.map(o => ({ reason: o, value: counts[o] })).sort((a, b) => b.value - a.value);
    return { data, hasData: noRows.length > 0, max: Math.max(1, ...data.map(d => d.value)) };
  }, [analysis]);

  const pendingRows = useMemo(() => uniqueCustomers(base.filter(r => r.status === 'pending')), [base]);
  const completedRows = useMemo(() => uniqueReviews(analysis), [analysis]);

  const sortedRows = useMemo(() => {
    const list = (subTab === 'pending' ? pendingRows : completedRows).slice();
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r: NPSRow): string | number => {
      switch (sort.key) {
        case 'name': return (r.name || '').toLowerCase();
        case 'contact': return r.contact ?? 0;
        case 'store': return (r.store || '').toLowerCase();
        case 'bm': return (r.bm || '').toLowerCase();
        case 'waiting': return daysSince(r.visit_date);
        case 'score': return r.score ?? -1;
        case 'understood': return r.understood == null ? -1 : (r.understood ? 1 : 0);
        case 'visit':
        default: return `${r.visit_date} ${r.time}`;
      }
    };
    return list.sort((a, b) => { const av = val(a), bv = val(b); return av < bv ? -1 * dir : av > bv ? 1 * dir : 0; });
  }, [subTab, pendingRows, completedRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'visit' || key === 'waiting' || key === 'score' ? 'desc' : 'asc' });

  const exportLabel = tab === 'overview' ? 'Export CSV' : subTab === 'pending' ? 'Export Pending CSV' : 'Export Completed CSV';
  const doExport = () => {
    if (tab === 'tracker' && subTab === 'pending') {
      exportCSV(
        `nps-pending-${from}_to_${to}.csv`,
        ['Name', 'Phone', 'Store', 'BM', 'Visit Date', 'Time', 'Days Waiting'],
        sortedRows.map(r => [r.name || '', fmtPhone(r.contact), r.store || '', r.bm || '', r.visit_date, r.time, daysSince(r.visit_date)]),
      );
    } else {
      const src = tab === 'overview' ? completedRows.slice().sort((a, b) => `${b.visit_date} ${b.time}`.localeCompare(`${a.visit_date} ${a.time}`)) : sortedRows;
      exportCSV(
        `nps-completed-${from}_to_${to}.csv`,
        ['Name', 'Phone', 'Store', 'BM', 'Visit Date', 'Time', 'Score', 'Bucket', 'Understood', 'Reasons', 'Comment'],
        src.map(r => [r.name || '', fmtPhone(r.contact), r.store || '', r.bm || '', r.visit_date, r.time, r.score ?? '', r.score != null ? bucketOf(r.score) : '', r.understood ? 'Yes' : 'No', (r.better || []).join(' / '), r.remark || '']),
      );
    }
  };

  const staleCount = pendingRows.filter(r => daysSince(r.visit_date) >= 3).length;
  const avgWait = pendingRows.length ? (pendingRows.reduce((a, r) => a + daysSince(r.visit_date), 0) / pendingRows.length).toFixed(1) : '—';
  const compNps = npsOf(completedRows);
  const compAvg = completedRows.length ? (completedRows.reduce((a, r) => a + r.score!, 0) / completedRows.length).toFixed(1) : '—';

  const storeLabel = stores.length === 0 ? 'All Stores' : stores.length === 1 ? stores[0] : `${stores.length} stores`;
  const chartHeight = Math.max(160, storeNpsData.length * 42 + 20);

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 max-w-[1400px] mx-auto">

      <h1 className="text-[22px] font-bold text-gray-900">Store Visit NPS</h1>

      <p className="text-[13px] text-gray-400 mt-0.5">
        Net Promoter Score from store-visit footfall · {storeLabel} · {fmtDate(from)} – {fmtDate(to)}
      </p>
      <p className="text-[11.5px] text-gray-400 mt-0.5">
        Promoter 9–10 · Passive 7–8 · Detractor 0–6. Separate from the field-service NPS on Site Audit &gt; Analytics, which scores completed site audits and
        installations on stricter bands — the two are not comparable.
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <MultiDropdown label="All Stores" dot="#3B82F6" accent="#3B82F6" options={branchOptions} selected={stores} onChange={setStores} />
        <MultiDropdown label="All BMs" dot={C.bm} accent={C.bm} options={bmOptions} selected={bms} onChange={setBms} searchable />
        <DateDropdown from={from} to={to} preset={preset} onApply={applyDate} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone..."
          className="border border-gray-300 rounded-full px-4 h-9 text-[13px] text-gray-700 outline-none focus:border-gray-400 w-[220px]"
        />
        <Segmented value={understood} onChange={setUnderstood} options={[{ val: 'all', label: 'Understood: All' }, { val: 'yes', label: 'Yes' }, { val: 'no', label: 'No' }]} />
        <Segmented value={category} onChange={setCategory} options={[{ val: 'all', label: 'All scores' }, { val: 'promoter', label: 'Promoters' }, { val: 'passive', label: 'Passives' }, { val: 'detractor', label: 'Detractors' }]} />
      </div>

      <div className="flex items-center justify-between mt-3">
        <button onClick={clearFilters} className="text-[13px] font-semibold text-gray-600 hover:text-gray-900 underline cursor-pointer">Clear filters</button>
        <button onClick={doExport} className="px-4 h-9 rounded-full text-[13px] font-bold text-white bg-gray-900 hover:bg-black cursor-pointer">{exportLabel}</button>
      </div>

      <div className="flex items-center gap-6 mt-5 border-b border-gray-200">
        {([['tracker', 'Tracker'], ['overview', 'Overview']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-2.5 text-[14px] font-semibold border-b-2 cursor-pointer transition-colors ${tab === k ? 'border-[#EAB308] text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tracker' && (
        <NpsTrackerTab
          sort={sort}
          toggleSort={toggleSort}
        PAGE_SIZE={PAGE_SIZE}
        avgWait={avgWait}
        compAvg={compAvg}
        compNps={compNps}
        completedRows={completedRows}
        cur={cur}
        loading={loading}
        page={page}
        pageRows={pageRows}
        pendingRows={pendingRows}
        setActive={setActive}
        setPage={setPage}
        setSort={setSort}
        setSubTab={setSubTab}
        sortedRows={sortedRows}
        staleCount={staleCount}
        subTab={subTab}
        totalPages={totalPages}
      />
      )}

      {tab === 'overview' && (
        <NpsOverviewTab
        bmChartData={bmChartData}
        chartHeight={chartHeight}
        cur={cur}
        dist={dist}
        distHasData={distHasData}
        mixData={mixData}
        prev={prev}
        reasonData={reasonData}
        responseTotals={responseTotals}
        storeNpsData={storeNpsData}
        storeResponseData={storeResponseData}
        trend={trend}
        trendHasData={trendHasData}
      />
      )}

      {active && (
        <SurveyModal
          row={active}
          onClose={() => setActive(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
