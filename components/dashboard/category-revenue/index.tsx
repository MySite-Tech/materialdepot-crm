'use client';

import { BMFilterChip, DateChip, FilterChip } from '../ui/chips';
import { CategoryOption, fetchAvailableBMs, fetchCategoryOptions, fetchDashboardData } from '@/lib/api';
import { DateRange } from '../types';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BUCKET_SEGREGATION, SEGREGATION_ORDER } from './constants';
import { BucketResult, CategoryRevenueProps, Segregation, SegregationTable, StoreActuals } from './types';
import { SegregationSection } from './ui/segregation-table';
import { StoreTargetCard } from './ui/store-targets';
import { TargetEditor } from './ui/target-editor';
import { useCategoryTargets } from './hooks/use-category-targets';
import {
  bucketResultFromBranchStatus,
  fmtChipDate,
  fmtFull,
  fmtShort,
  monthElapsedFraction,
  monthKey,
  monthLabel,
  monthToDateRange,
  pctStr,
  previousMonthRange,
  targetFor,
  unmatchedSheetCategories,
  buildSegregationTables,
} from './utils';

type BucketMap = Partial<Record<'total' | Segregation, BucketResult>>;

async function loadBuckets(
  tables: SegregationTable[],
  filters: { branch?: string[]; bm?: string[]; createdFrom?: string; createdTo?: string },
): Promise<BucketMap> {
  const calls: { key: 'total' | Segregation; category?: string[] }[] = [
    { key: 'total' },
    ...tables.filter(t => t.queryNames.length).map(t => ({ key: t.segregation, category: t.queryNames })),
  ];
  const settled = await Promise.allSettled(
    calls.map(c => fetchDashboardData({ ...filters, category: c.category })),
  );
  const out: BucketMap = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out[calls[i].key] = bucketResultFromBranchStatus(r.value.branchStatus || []);
  });
  return out;
}

export default function CategoryRevenueDashboard({ branches, allowedBranches, canEditTargets }: CategoryRevenueProps) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = useMemo(() => {
    const base = isRestricted ? allowedBranches : branches;
    return base.filter(b => b !== 'HQ');
  }, [branches, allowedBranches, isRestricted]);

  const defaultRange = useMemo(() => monthToDateRange(), []);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [bmFilter, setBmFilter] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange>(defaultRange);

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[] | null>(null);
  const [bmRows, setBmRows] = useState<{ name: string; contact: string }[]>([]);

  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => setCategoryOptions(null));
  }, []);

  const branchCsv = useMemo(() => (
    isRestricted
      ? (branchFilter.length ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
      : branchFilter
  ).join(','), [isRestricted, branchFilter, allowedBranches]);
  const bmCsv = bmFilter.join(',');

  useEffect(() => {
    fetchAvailableBMs(branchCsv ? branchCsv.split(',') : undefined)
      .then(setBmRows)
      .catch(() => setBmRows([]));
  }, [branchCsv]);

  const liveCategories = useMemo(() => (categoryOptions ?? []).map(c => c.name), [categoryOptions]);
  const tables = useMemo(
    () => (liveCategories.length ? buildSegregationTables(liveCategories) : []),
    [liveCategories],
  );
  const unmatched = useMemo(
    () => (liveCategories.length ? unmatchedSheetCategories(liveCategories) : []),
    [liveCategories],
  );

  const [filtered, setFiltered] = useState<BucketMap>({});
  const [filteredLoading, setFilteredLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tables.length) return;
    let cancelled = false;
    setFilteredLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadBuckets(tables, {
        branch: branchCsv ? branchCsv.split(',') : undefined,
        bm: bmCsv ? bmCsv.split(',') : undefined,
        createdFrom: range.from || undefined,
        createdTo: range.to || undefined,
      }).then(res => {
        if (cancelled) return;
        setFiltered(res);
        setFilteredLoading(false);
      });
    }, 400);
    return () => { cancelled = true; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [tables, branchCsv, bmCsv, range.from, range.to]);

  const month = useMemo(() => monthKey(new Date()), []);
  const pace = useMemo(() => monthElapsedFraction(new Date()), []);
  const [mtd, setMtd] = useState<BucketMap>({});
  const [mtdLoading, setMtdLoading] = useState(true);

  useEffect(() => {
    if (!tables.length) return;
    let cancelled = false;
    setMtdLoading(true);
    const mtdRange = monthToDateRange(new Date());
    loadBuckets(tables, {
      branch: branchCsv ? branchCsv.split(',') : undefined,
      createdFrom: mtdRange.from,
      createdTo: mtdRange.to,
    }).then(res => {
      if (cancelled) return;
      setMtd(res);
      setMtdLoading(false);
    });
    return () => { cancelled = true; };
  }, [tables, branchCsv]);

  const { targets, save } = useCategoryTargets();
  const [editingTargets, setEditingTargets] = useState(false);

  const actualsByStore = useMemo(() => {
    const out: Record<string, StoreActuals> = {};
    const read = (key: 'total' | Segregation, store: string): number | null => {
      const bucket = mtd[key];
      if (!bucket) return null;
      return bucket.byStore[store]?.revenue ?? 0;
    };
    for (const store of branchOptions) {
      out[store] = {
        total: read('total', store),
        core: read(BUCKET_SEGREGATION.core as Segregation, store),
        nonCore: read(BUCKET_SEGREGATION.nonCore as Segregation, store),
        special: read(BUCKET_SEGREGATION.special as Segregation, store),
      };
    }
    return out;
  }, [mtd, branchOptions]);

  const visibleStores = useMemo(
    () => (branchFilter.length ? branchOptions.filter(b => branchFilter.includes(b)) : branchOptions),
    [branchOptions, branchFilter],
  );

  const total = filtered.total;
  const bucketSumRevenue = SEGREGATION_ORDER.reduce(
    (s, seg) => s + (filtered[seg]?.overall.revenue ?? 0), 0,
  );
  const overlap = bucketSumRevenue - (total?.overall.revenue ?? 0);

  const hasFilters = branchFilter.length > 0 || bmFilter.length > 0
    || range.from !== defaultRange.from || range.to !== defaultRange.to;

  const datePresets = useMemo(() => [
    { label: 'This month', range: () => monthToDateRange() },
    { label: 'Last month', range: () => previousMonthRange() },
    { label: 'All time', range: () => ({ from: '', to: '' }) },
  ], []);

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-2.5 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip label="Store" options={branchOptions} selected={branchFilter}
          onChange={v => { setBranchFilter(v); setBmFilter([]); }} color={{ active: '#3B82F6' }} />
        <DateChip label="Date Range" value={range} onChange={setRange} color={{ active: '#F59E0B' }} presets={datePresets} />
        <BMFilterChip selected={bmFilter} onChange={setBmFilter} options={bmRows} color={{ active: '#8B5CF6' }} />
        {hasFilters && (
          <button onClick={() => { setBranchFilter([]); setBmFilter([]); setRange(defaultRange); }}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border border-red-200 text-red-500 hover:bg-red-50 bg-transparent transition-all">
            ✕ Reset
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {filteredLoading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          {!filteredLoading && total && `${total.overall.carts.toLocaleString('en-IN')} carts · ${fmtShort(total.overall.revenue)}`}
        </span>
      </div>

      {categoryOptions === null && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-[12px] text-red-700">
          ⚠ Could not load the CRM category list, so the segregation tables cannot be built.
        </div>
      )}
      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-[12px] text-amber-800">
          ⚠ On the segregation sheet but not a CRM category, so{' '}
          {unmatched.length === 1 ? 'it carries' : 'they carry'} no figures:{' '}
          <span className="font-semibold">{unmatched.join(', ')}</span>. Resolve it on the sheet, or
          add the category in the CRM.
        </div>
      )}

      <section>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <h2 className="text-[15px] font-bold text-gray-900">Store Targets — Month to Date</h2>
          <span className="text-[11px] text-gray-400">
            {monthLabel(month)} · 1st to today · {(pace * 100).toFixed(0)}% of the month elapsed
          </span>
          {canEditTargets && (
            <button onClick={() => setEditingTargets(true)}
              className="ml-auto px-3 py-1 rounded-full border border-gray-300 text-[11px] font-semibold text-gray-600 hover:border-gray-400 cursor-pointer bg-white">
              Edit targets
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Fixed to the calendar month and the Store filter. The Date Range and BM chips do not apply
          here{bmFilter.length > 0 ? ' — a BM is selected above, but these are store totals' : ''}.
          The tick on each bar is the month&apos;s elapsed pace.
        </p>
        {mtdLoading ? (
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-8 text-center text-[12px] text-gray-400">Loading store progress…</div>
        ) : visibleStores.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-8 text-center text-[12px] text-gray-400">No stores in range</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleStores.map(store => (
              <StoreTargetCard
                key={store}
                store={store}
                actuals={actualsByStore[store]}
                target={targetFor(targets, month, store)}
                pace={pace}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-[15px] font-bold text-gray-900">Category-wise Revenue</h2>
          <span className="text-[11px] text-gray-400">
            {range.from || range.to
              ? `carts created ${range.from ? fmtChipDate(range.from) : '…'} – ${range.to ? fmtChipDate(range.to) : '…'}`
              : 'all time'}
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Distinct Clients</div>
            <div className="text-[15px] font-bold text-gray-300 font-mono mt-0.5">—</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Carts</div>
            <div className="text-[15px] font-bold text-gray-900 font-mono mt-0.5">{total ? total.overall.carts.toLocaleString('en-IN') : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Orders</div>
            <div className="text-[15px] font-bold text-gray-900 font-mono mt-0.5">{total ? total.overall.orders.toLocaleString('en-IN') : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Revenue</div>
            <div className="text-[15px] font-bold text-gray-900 font-mono mt-0.5">{total ? fmtFull(total.overall.revenue) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Order Conversion</div>
            <div className="text-[15px] font-bold text-gray-900 font-mono mt-0.5">{total ? pctStr(total.overall.orders, total.overall.carts) : '—'}</div>
          </div>
        </div>

        {tables.map(table => (
          <SegregationSection
            key={table.segregation}
            table={table}
            result={filtered[table.segregation]}
            stores={visibleStores}
            loading={filteredLoading}
          />
        ))}
      </section>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[11px] text-gray-500 leading-relaxed space-y-1.5">
        <div className="font-semibold text-gray-700 text-[12px]">How to read this</div>
        <div>
          <span className="font-semibold">Rows are stores, not individual categories.</span> Django
          aggregates one category filter per request, and per-category rows would mean one request
          per category — over the ten-request budget. They arrive when{' '}
          <span className="font-mono">/crm/leads/stats/?category_groups=</span> exists, mirroring the{' '}
          <span className="font-mono">bm_groups</span> parameter the KAM board already uses. The
          category chips above each table are the segregation itself, so the classification stays
          reviewable.
        </div>
        <div>
          <span className="font-semibold">Distinct Clients has no endpoint at any granularity</span>{' '}
          and reads — rather than a number that would be wrong. Counting it in the browser means
          paging every deal in range.
        </div>
        <div>
          <span className="font-semibold">A mixed cart is split across segregations.</span>{' '}
          Django values a category-filtered deal at the share of its line items in those categories,
          so a cart of tiles and plywood lands partly in Core and partly in Non-Core instead of
          counting in full under each. The four segregation totals therefore reconcile to the real
          total:{' '}
          {filteredLoading || !total ? '—' : (
            <>{fmtFull(bucketSumRevenue)} against {fmtFull(total.overall.revenue)}
            {Math.abs(overlap) > 1 ? `, ${fmtFull(Math.abs(overlap))} apart — carts whose lines carry no category` : ''}.</>
          )}
        </div>
        <div>
          <span className="font-semibold">Revenue</span> is the cart value of deals at Order Placed,
          Order Confirmed, Partly Shipped, Shipped, Partly Delivered or Delivered — the set the
          Client Database and the conversion funnel also call an order.{' '}
          <span className="font-semibold">Carts</span> is every deal in range, and{' '}
          <span className="font-semibold">Order Conversion %</span> is orders ÷ carts.
        </div>
        <div>
          <span className="font-semibold">Dates filter on cart created date</span>, the only date
          every deal carries. A cart created last month and ordered this month counts in last month.
        </div>
      </div>

      {editingTargets && (
        <TargetEditor
          month={month}
          stores={branchOptions}
          targets={targets}
          onClose={() => setEditingTargets(false)}
          onSave={save}
        />
      )}
    </div>
  );
}
