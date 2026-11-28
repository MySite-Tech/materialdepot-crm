'use client';

import type { ClientFlowReport, MonthWindow, RevenueOrder } from '@/lib/b2b/revenue';
import { JourneyLens, buildJourney, lifecycleOf, throughDay } from '@/lib/b2b/revenue/journey';
import { ReactNode, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { fmtL } from '../../../../models/mock-data';
import type { MonthState } from '../../types';
import { Card, Notice, SectionHead } from '../../ui';
import { LENS_HINT, LENS_LABEL } from './constants';
import { Bridge } from './ui/bridge';
import { CategoryShift, PartnerSources } from './ui/breakdowns';
import { FirmFlow } from './ui/flow';
import { FirmTable } from './ui/firm-table';
import { MonthTrend, RetentionGrid } from './ui/retention';
import { FIRM_SETS, FirmFocus, FirmSet, change, fmtK, fmtPct, monthName, pct } from './utils';

function Tile({ label, value, sub, delta, invert, goesTo, active, onClick }: {
  label: string;
  value: string;
  sub: ReactNode;
  delta?: { text: string; up: boolean } | null;
  invert?: boolean;
  goesTo: string;
  active?: boolean;
  onClick: () => void;
}) {
  const good = delta ? (invert ? !delta.up : delta.up) : false;
  return (
    <button
      type="button"
      onClick={onClick}
      title={goesTo}
      aria-pressed={active}
      className={`group text-left rounded-xl border bg-white px-4 py-3 cursor-pointer transition hover:border-gray-400 hover:shadow-sm ${active ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-500">{label}</span>
        <span className={`text-[11px] font-semibold whitespace-nowrap ${active ? 'text-gray-900' : 'text-gray-300 group-hover:text-gray-700'}`}>{goesTo} →</span>
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight whitespace-nowrap">{value}</span>
        {delta && <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{delta.up ? '▲' : '▼'} {delta.text.replace(/^[+-]/, '')}</span>}
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{sub}</div>
    </button>
  );
}

const Select = ({ value, options, onChange }: { value: string; options: { key: string; label: string }[]; onChange: (v: string) => void }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-lg border border-gray-200 px-2 text-[12.5px] font-semibold text-gray-800 bg-white cursor-pointer">
    {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
  </select>
);

export function Journey({ windows, reports, flow }: { windows: MonthWindow[]; reports: Record<string, MonthState>; flow: ClientFlowReport | null }) {
  const ordered = useMemo(() => [...windows].sort((x, y) => x.key.localeCompare(y.key)), [windows]);
  const current = ordered[ordered.length - 1];
  const [lens, setLens] = useState<JourneyLens>('studio');
  const [a, setA] = useState(ordered[0].key);
  const [b, setB] = useState(current.key);
  const [sameDays, setSameDays] = useState(true);
  const [focus, setFocus] = useState<FirmFocus | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setFocus(null); }, [lens, a, b, sameDays]);

  const cutoff = sameDays && b === current.key ? Number(current.to.slice(8)) : null;
  const failed = ordered.filter((w) => reports[w.key]?.error);
  const ready = ordered.every((w) => reports[w.key]?.report);
  const orders = useMemo(() => {
    if (!ready) return null;
    return Object.fromEntries(ordered.map((w) => [w.key, throughDay(reports[w.key].report!.orders as RevenueOrder[], cutoff)]));
  }, [ready, ordered, reports, cutoff]);
  const lifecycle = useMemo(() => lifecycleOf(flow?.months ?? []), [flow]);
  const journey = useMemo(() => (orders ? buildJourney({ reports: orders, a, b, lens, lifecycle }) : null), [orders, a, b, lens, lifecycle]);

  const scrollTo = (ref: RefObject<HTMLDivElement | null>) =>
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const pick = (f: FirmFocus | null) => {
    setFocus(f);
    if (f) scrollTo(tableRef);
  };
  const options = ordered.map((w) => ({ key: w.key, label: `${monthName(w.key, true)} ${w.key.slice(0, 4)}${w.key === current.key ? ' (so far)' : ''}` }));
  const A = monthName(a);
  const B = monthName(b);

  const controls = (
    <Card>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {(['studio', 'all'] as const).map((l) => (
            <button key={l} title={LENS_HINT[l]} onClick={() => setLens(l)} className={`px-3 py-1.5 rounded-md text-[12px] font-semibold cursor-pointer ${lens === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>{LENS_LABEL[l]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <span className="font-semibold">From</span>
          <Select value={a} options={options.filter((o) => o.key < b)} onChange={setA} />
          <span className="font-semibold">to</span>
          <Select value={b} options={options.filter((o) => o.key > a)} onChange={setB} />
        </div>
        {b === current.key && (
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer">
            <input type="checkbox" checked={sameDays} onChange={(e) => setSameDays(e.target.checked)} className="accent-gray-900" />
            Same days only (1–{Number(current.to.slice(8))} of every month)
          </label>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">{LENS_HINT[lens]}</p>
    </Card>
  );

  if (failed.length) {
    return <>{controls}<Notice title={`${failed.map((w) => monthName(w.key, true)).join(', ')} could not be read.`}>The journey needs every month, so nothing is shown rather than a partial picture. Refresh to retry.</Notice></>;
  }
  if (!journey) {
    return <>{controls}<Card><p className="text-[12px] text-gray-400">Reading every month&rsquo;s orders. The first open can take a minute.</p></Card></>;
  }

  const mA = journey.months.find((m) => m.key === a)!;
  const mB = journey.months.find((m) => m.key === b)!;
  const kept = journey.retention.find((r) => r.from === a && r.to === b)!;
  const lost = journey.firms.filter(FIRM_SETS.lost);
  const joined = journey.firms.filter(FIRM_SETS.joined);
  const partial = b === current.key ? ' so far' : '';
  const setLabel: Record<FirmSet, string> = {
    ordering: `Ordering in ${B}`,
    kept: `Ordered in ${A} and ${B}`,
    lost: `Ordered in ${A}, not in ${B}`,
    joined: `Joined by ${B}`,
  };
  const isSet = (set: FirmSet) => focus?.kind === 'set' && focus.set === set;
  const toggleSet = (set: FirmSet) => pick(isSet(set) ? null : { kind: 'set', set, label: setLabel[set] });

  return (
    <>
      {controls}
      {!flow && <Notice title="The Clients read has not loaded.">New, revived and store-buyer firms read as &ldquo;Skipped the first month&rdquo; until it does.</Notice>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile label={`${LENS_LABEL[lens]}, ${A} → ${B}${partial}`} value={fmtL(mB.value)} sub={<>from {fmtL(mA.value)} in {A}</>} delta={change(mB.value, mA.value)} goesTo="See the bridge" onClick={() => scrollTo(bridgeRef)} />
        <Tile label="Firms ordering" value={String(mB.firms)} sub={<>from {mA.firms} in {A}</>} delta={change(mB.firms, mA.firms)} goesTo="See these firms" active={isSet('ordering')} onClick={() => toggleSet('ordering')} />
        <Tile label="Average order" value={fmtK(mB.aov)} sub={<>from {fmtK(mA.aov)} · {mB.orders} orders vs {mA.orders}</>} delta={change(mB.aov, mA.aov)} goesTo="See the trend" onClick={() => scrollTo(trendRef)} />
        <Tile label={`Retention, ${A} → ${B}`} value={fmtPct(pct(kept.kept, kept.base))} sub={<>{kept.kept} of {kept.base} {kept.base === 1 ? 'firm' : 'firms'} · revenue {fmtPct(pct(kept.keptValue, kept.baseValue))}</>} goesTo="See these firms" active={isSet('kept')} onClick={() => toggleSet('kept')} />
        <Tile label="Churned" value={String(lost.length)} sub={<>{fmtPct(pct(lost.length, kept.base))} of {A}&rsquo;s firms · spent {fmtL(lost.reduce((n, r) => n + r.a.value, 0))} in {A}</>} goesTo="See these firms" active={isSet('lost')} onClick={() => toggleSet('lost')} />
        <Tile label="Joined since" value={String(joined.length)} sub={<>new, revived, back or from EC · {fmtL(joined.reduce((n, r) => n + r.b.value, 0))} in {B}</>} goesTo="See these firms" active={isSet('joined')} onClick={() => toggleSet('joined')} />
      </div>

      <div ref={bridgeRef} className="scroll-mt-4">
        <Card>
          <SectionHead title={`How ${A}'s ${fmtL(journey.startValue)} became ${B}'s ${fmtL(journey.endValue)}`} hint="Every firm's change between the two months, grouped by what happened to it. The steps add up exactly. Click a step to list its firms." />
          <Bridge journey={journey} focus={focus} onFocus={pick} />
        </Card>
      </div>

      <Card>
        <SectionHead title={`Where ${A}'s firms went, and who joined by ${B}`} hint="Band width is the number of firms. A Studio firm cannot become EC Direct once its tie-up starts; EC Direct firms can move to Studio, stay or stop." />
        <FirmFlow journey={journey} focus={focus} onFocus={pick} />
      </Card>

      <div ref={trendRef} className="scroll-mt-4 grid lg:grid-cols-2 gap-3">
        <Card>
          <SectionHead title="Month by month" hint={cutoff ? `Each month counts days 1–${cutoff} only, to match this month so far.` : undefined} />
          <MonthTrend journey={journey} />
        </Card>
        <Card>
          <SectionHead title="Retention and churn" hint="Firms are counted for the selected measure: under Studio Sales, a firm counts only in months it ordered through Studio." />
          <RetentionGrid journey={journey} partialKey={b === current.key ? current.key : null} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <SectionHead title={`Where ${B}'s new revenue came from`} hint="How B2B holds each firm that joined: the team's lead, a KAM firm, an EC B2B referral, a Studio Space referral and so on." />
          <PartnerSources journey={journey} />
        </Card>
        <Card>
          <SectionHead title={`What they bought: ${A} against ${B}`} />
          <CategoryShift journey={journey} focus={focus} onFocus={pick} />
        </Card>
      </div>

      <div ref={tableRef} className="scroll-mt-4">
        <Card>
          <SectionHead title="Firms" hint="Every firm that ordered in either month. Click a row for its months, categories and who holds it." />
          <FirmTable journey={journey} focus={focus} onFocus={setFocus} />
        </Card>
      </div>
    </>
  );
}
