'use client';

import { useMemo, useState } from 'react';

import type { Group, LeadMode, ScoreMode, ViewProps } from '../../types';
import { aggregate, topBranch } from '../../utils/aggregate';
import { dayList, dlabel, today } from '../../utils/dates';
import { filterTitle, makePredicate } from '../../utils/filtering';
import { leadStats } from '../../utils/scoring';
import { fmt } from '../../utils/format';
import { FOCUS, NOTE, Seg } from '../../ui';
import { DayTrend } from './day-trend';
import { Heatmap } from './heatmap';
import { LengthKpis, PointerKpis } from './kpis';
import { GroupTable, NamedGroup } from './tables';

const EMPTY: Group<string> = { k: 'all', n: 0, b: [0, 0, 0, 0], cp: 0, len: 0, leads: new Set(), br: new Map(), lm: new Map(), L: leadStats(new Map()) };

function HowDetected() {
  return (
    <details className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[13px]">
      <summary className={`cursor-pointer font-semibold rounded ${FOCUS}`}>How a pointer is detected</summary>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li><b>Need</b>: names a product or space or quantity: tiles, flooring, wallpaper, laminate, plywood, panels, quartz… kitchen, bathroom, bedroom… sqft, boxes, 3BHK.</li>
        <li><b>Stuck</b>: names a blocker: price / budget / discount, availability / stock / lead time, colour / design not liked, carpenter / family / approval, other vendor, site or civil work not ready, measurements, payment, outstation, no requirement now.</li>
        <li><b>Who</b>: names a person or role: husband, wife, father, family, architect, designer, interior, carpenter, contractor, builder, self…</li>
        <li><b>Next + date</b>: an action (call, visit, send, share, place order, confirm…) <i>and</i> a date or time-frame (today, tomorrow, Mon–Sun, weekend, next week, in 3 days, 12 Oct, 12/10…). &quot;will revisit&quot; alone does not count.</li>
        <li>Remarks written in the guide format (Need: / Stuck: / Who: / Next:) are picked up directly. Detection is keyword-based, so treat single remarks as indicative; the lead and BM averages are what to manage on. &quot;RNR / not responding&quot; covers none of the 4.</li>
      </ul>
    </details>
  );
}

export function DashboardView({ ds, filters, ctx, cur, onDrill, mode, setMode, leadMode, setLeadMode }: ViewProps & {
  mode: ScoreMode;
  setMode: (m: ScoreMode) => void;
  leadMode: LeadMode;
  setLeadMode: (m: LeadMode) => void;
}) {
  const [hmBy, setHmBy] = useState<'bm' | 'ec'>('bm');
  const { dicts } = ds;
  const title = filterTitle(ds, filters);

  const tot = useMemo(() => aggregate(cur, () => 'all', ctx)[0] ?? EMPTY, [cur, ctx]);
  const people = useMemo(() => new Set(cur.map(r => r.author)).size, [cur]);
  const ecs = useMemo<NamedGroup[]>(() => {
    const byBranch = new Map<number, Set<number>>();
    for (const r of cur) { let s = byBranch.get(r.branch); if (!s) { s = new Set(); byBranch.set(r.branch, s); } s.add(r.author); }
    return aggregate(cur, r => r.branch, ctx).map(g => ({ ...g, name: dicts.branch[g.k], people: byBranch.get(g.k)?.size ?? 0 }));
  }, [cur, ctx, dicts]);
  const bms = useMemo<NamedGroup[]>(
    () => aggregate(cur, r => r.author, ctx).map(g => ({ ...g, name: dicts.person[g.k] || '(unknown)', ec: dicts.branch[topBranch(g)] })),
    [cur, ctx, dicts],
  );
  const autoCount = useMemo(() => {
    if (mode !== 'len') return 0;
    const pass = makePredicate(ds, { ...filters, auto: true });
    return ds.remarks.filter(r => r.auto && pass(r)).length;
  }, [ds, filters, mode]);
  const days = useMemo(() => dayList(filters.date[0] || ds.minDay, filters.date[1] || today()), [filters.date, ds.minDay]);
  const total: NamedGroup = { ...tot, k: -1, name: 'Total', people };

  const heatRows = hmBy === 'bm'
    ? [...bms].sort((a, b) => b.L.n - a.L.n).map(g => g.k)
    : [...ecs].sort((a, b) => b.L.n - a.L.n).map(g => g.k);
  const heatName = (k: number) => (hmBy === 'bm' ? dicts.person[k] || '(unknown)' : dicts.branch[k]);
  const heatMatch = (k: number) => (hmBy === 'bm' ? (r: { author: number }) => r.author === k : (r: { branch: number }) => r.branch === k);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Score by</span>
        <Seg value={mode} onChange={setMode} options={[['pt', '4 pointers (lead-wise)'], ['len', 'Remark length']]} />
        {mode === 'pt' && (
          <>
            <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 sm:ml-2.5">Lead score from</span>
            <Seg value={leadMode} onChange={setLeadMode} options={[
              ['best', 'Best single remark', "Score of the lead's single best remark"],
              ['union', 'All its remarks combined', "A pointer counts if any of the lead's remarks (in these filters) covers it"],
            ]} />
          </>
        )}
      </div>

      {mode === 'pt' ? (
        <>
          <PointerKpis tot={tot} people={people} copyNothing={ctx.copyNothing}
            onLeads={s => onDrill({ title, match: () => true, tab: s < 0 ? -1 : 100 + s, group: 'lead' })}
            onCopies={() => onDrill({ title, match: () => true, tab: 9 })} />
          <HowDetected />
        </>
      ) : (
        <LengthKpis tot={tot} people={people} thresholds={ctx.thresholds} autoCount={autoCount} includeAuto={filters.auto}
          onBucket={tab => onDrill({ title, match: () => true, tab })} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => onDrill({ title, match: () => true })}
          className={`bg-amber-400 hover:bg-amber-300 font-semibold rounded-lg px-4 py-2 text-[13px] text-gray-900 cursor-pointer ${FOCUS}`}>
          View all {fmt(tot.n)} remarks for these filters ▸
        </button>
        <span className={NOTE}>Click any tile, row, day or cell to see the remarks behind it</span>
      </div>

      <GroupTable title="By Experience Centre" mode={mode} bm={false} groups={ecs} total={total}
        hint={`${mode === 'pt' ? 'Lead-wise · ' : ''}branch of the lead owner · click a row for its remarks`}
        onRow={g => onDrill({ title: g.name, match: r => r.branch === g.k })} />
      <GroupTable title="By BM" mode={mode} bm groups={bms}
        hint={mode === 'pt'
          ? 'Leads this person wrote remarks on, scored on their remarks only · ! = half or more of their leads cover none of the 4 · COPY = 20%+ of their remarks copy-pasted · click for their remarks'
          : 'Person who wrote the remark · ! = more than half their remarks are "Nothing" · COPY = 20%+ of their remarks are copy-pasted · click for their remarks'}
        onRow={g => onDrill({ title: g.name, match: r => r.author === g.k })} />

      <DayTrend days={days} rows={cur} ctx={ctx} mode={mode} onDay={d => onDrill({ title: `All remarks · ${dlabel(d)}`, match: r => r.day === d })} />

      <Heatmap days={days} rows={cur} ctx={ctx} mode={mode} by={hmBy} onBy={setHmBy} rowKeys={heatRows} rowName={heatName}
        onCell={(k, d) => { const m = heatMatch(k); onDrill({ title: `${heatName(k)} · ${dlabel(d)}`, match: r => m(r) && r.day === d }); }}
        onRow={k => onDrill({ title: `${heatName(k)} · ${title}`, match: heatMatch(k) })}
        onDay={d => onDrill({ title: dlabel(d), match: r => r.day === d, group: 'bm' })} />

      <p className={NOTE}>
        Source: Sales CRM lead remarks (ticket_remarks_log) for deal + follow-up tickets. 4 pointers = Need / Stuck / Who / Next + date from the remarks guide;
        a lead&apos;s score is how many of the 4 its best single remark in these filters covers (or, by toggle, all its remarks combined), and BM rows score only that BM&apos;s remarks.
        Length = characters after trimming spaces. Copy-pasted = the same BM posted the same text (ignoring case, spaces and punctuation) on 2+ different leads that day; Nothing-level texts are not counted as copies.
        Status is the lead&apos;s current status (latest estimate on that client after the lead was created; &quot;Order Lost&quot; if the deal was marked lost).
        Branch = lead owner&apos;s Experience Centre. First remark = the first typed remark ever on that cart ID. Data refreshes every 10 min; ↻ forces a fresh pull.
      </p>
    </div>
  );
}
