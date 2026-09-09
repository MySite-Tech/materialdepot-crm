'use client';

import { ClosurePipelineSection } from './closure';
import { Dropdown } from './dropdowns';
import { CrmAdherenceSection, OrdersLostTable, PipelineTable, RankingTable, WalkinTable } from './tables';
import { Props } from '../types/report-card';
import { Section } from './ui';
import { fmtDate, monthEndISO, monthStartISO } from '../utils/report-card';
import { CategoryOption, ReportCardBMOption, ReportCardData, fetchAvailableBMs, fetchCategoryOptions, fetchReportCard } from '@/lib/mockApi';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function ReportCardDashboard({ branches, allowedBranches, currentUserPhone }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');

  const [dateFrom, setDateFrom] = useState(monthStartISO);
  const [dateTo, setDateTo] = useState(monthEndISO);
  const [store, setStore] = useState('');
  const [, setBmLabel] = useState('');
  const [bmContact, setBmContact] = useState('');
  const [category, setCategory] = useState('');

  const [data, setData] = useState<ReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bmList, setBmList] = useState<ReportCardBMOption[]>([]);
  const [catList, setCatList] = useState<CategoryOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchCategoryOptions().then(setCatList).catch(() => setCatList([])); }, []);

  const branchKey = store || '';
  useEffect(() => {
    const eff = branchKey ? [branchKey] : (isRestricted ? allowedBranches : undefined);
    fetchAvailableBMs(eff).then(setBmList).catch(() => setBmList([]));
  }, [branchKey, isRestricted, allowedBranches]);

  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || bmContact || bmList.length === 0) return;
    const mine = currentUserPhone
      ? bmList.find(b => b.contact === currentUserPhone || b.contact === currentUserPhone.replace(/^(\+?91)/, ''))
      : undefined;
    const pick = mine ?? bmList[0];
    setBmContact(pick.contact);
    setBmLabel(pick.name);
    autoPicked.current = true;
  }, [bmList, bmContact, currentUserPhone]);

  const load = useCallback(() => {
    setLoading(true);
    fetchReportCard({
      bm: bmContact.trim() || undefined,
      branch: store ? [store] : undefined,
      dateFrom, dateTo,
      category: category || undefined,
    }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [bmContact, store, dateFrom, dateTo, category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load]);

  const reset = () => {
    setDateFrom(monthStartISO()); setDateTo(monthEndISO());
    setStore(''); setBmLabel(''); setBmContact(''); setCategory('');
  };

  const rangeLabel = data?.meta
    ? `${fmtDate(data.meta.date_from)} – ${fmtDate(data.meta.date_to)}`
    : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
  const catNames = catList.map(c => c.name);

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6 max-w-[1400px] mx-auto">

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Material Depot · Internal Analytics</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">BM Report Card</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {data?.meta?.has_bm
            ? <>Performance snapshot for <span className="font-semibold text-gray-700">{data.meta.bm_name}</span>{data.meta.store && <> · {data.meta.store}</>} · {rangeLabel}</>
            : <>Select a BM to see their performance snapshot · {rangeLabel}</>}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm sticky top-0 z-40">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Date</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="text-gray-300">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <Dropdown value={store} placeholder="All Stores" onChange={v => { setStore(v); }}
          options={[{ label: 'All Stores', value: '' }, ...branchOptions.map(b => ({ label: b, value: b }))]} searchable />
        <Dropdown value={bmContact} placeholder="Select BM" searchable
          onChange={v => { const o = bmList.find(x => x.contact === v); setBmContact(v); setBmLabel(o?.name ?? ''); }}
          options={[{ label: 'Select BM', value: '' }, ...bmList.map(b => ({ label: `${b.name}${b.contact ? ` · ${b.contact}` : ''}`, value: b.contact }))]} />
        <Dropdown value={category} placeholder="All Categories" onChange={setCategory} searchable
          options={[{ label: 'All Categories', value: '' }, ...catNames.map(c => ({ label: c, value: c }))]} />
        <button onClick={reset} className="ml-auto text-[12px] font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">Reset Filters</button>
        {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
      </div>

      {loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Loading…</div>}
      {!loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Failed to load data. Check filters and try again.</div>}

      {data && (
        <div className={`space-y-8 transition-opacity duration-150 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <Section n="01" title="Walkin Attendance & Conversion" hint="Footfall breakdown · cart creation · revenue conversion">
            <WalkinTable w={data.walkin_analysis} />
          </Section>
          <Section n="02" title="Pipeline Cart Breakdown" hint="All open carts not yet won or lost · as of today">
            <PipelineTable p={data.pipeline_carts} />
          </Section>
          <Section n="03" title="Orders Lost Breakdown" hint="Lost count & value by reason">
            <OrdersLostTable o={data.orders_lost} />
          </Section>
          <Section n="04" title="CRM Adherence & Walkin Averages" hint="Follow-up discipline · turnaround time · footfall patterns">
            <CrmAdherenceSection c={data.crm_adherence} range={rangeLabel} />
          </Section>
          <Section n="05" title="Closure Pipeline" hint="Clients with expected closure in selected range">
            <ClosurePipelineSection clients={data.closure_pipeline.clients} catOptions={catNames} />
          </Section>
          <Section n="06" title="BM Rankings" hint="How the selected BM compares to peers · highlighted row = selected BM">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RankingTable title="Company-Wide" rows={data.rankings.company_wide} showStore />
              <RankingTable title={data.meta.store ? `Within ${data.meta.store}` : 'Within Store'} rows={data.rankings.within_store} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
