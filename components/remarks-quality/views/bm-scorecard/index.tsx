'use client';

import { useEffect, useMemo, useState } from 'react';

import { DEFAULT_BM_RANK_MIN, INK, MUTED, PAGE_SIZE, PDESC, SCORE_COLORS, WALKIN_DAYS } from '../../constants';
import type { ViewProps } from '../../types';
import { Sort, nextSort, sortBy } from '../../utils/aggregate';
import { dlabel } from '../../utils/dates';
import { filterTitle } from '../../utils/filtering';
import { avg1, avgColor, count, coverageColor, fmt, goodBadHeat, pctText, walkinColor } from '../../utils/format';
import { leadStats } from '../../utils/scoring';
import { KPI_GRID, Kpi, NOTE, Pager, Panel, ROW, SortTh, TableScroll, Th, activate } from '../../ui';
import { ScoreSortKey, buildScorecard, scoreSortValue } from './utils';

const COLS: Array<[ScoreSortKey, string, boolean?, string?]> = [
  ['qr', '#', false, 'Rank by quality score among ranked BMs'], ['name', 'BM', true], ['ec', 'EC', true],
  ['leads', 'Leads', false, 'Leads this BM wrote remarks on'], ['avg', 'Quality score', false, 'Average pointers covered per lead, out of 4'],
  ['delta', 'Δ', false, 'Change in quality score vs the previous window of the same length (needs 3+ leads)'],
  ['all4', 'All 4', false, 'Leads covering all 4 pointers'], ['none', 'None', false, 'Leads covering none of the 4 pointers'],
  ['c0', 'Need', false, PDESC[0]], ['c1', 'Stuck', false, PDESC[1]], ['c2', 'Who', false, PDESC[2]], ['c3', 'Next+date', false, PDESC[3]],
  ['wp', 'Walk-ins remarked', false, 'Walk-ins on leads they own that got a remark the same day'],
];

export function BmScorecardView({ ds, filters, ctx, cur, onDrill }: ViewProps) {
  const [rankMin, setRankMin] = useState(DEFAULT_BM_RANK_MIN);
  const [sort, setSort] = useState<Sort<ScoreSortKey>>({ k: 'avg', dir: -1 });
  const [page, setPage] = useState(1);
  const sc = useMemo(() => buildScorecard(ds, filters, ctx, cur, rankMin), [ds, filters, ctx, cur, rankMin]);
  const sorted = useMemo(() => sortBy(sc.list, x => scoreSortValue(x, sort.k), sort.dir), [sc.list, sort]);
  useEffect(() => { setPage(1); }, [sorted]);

  const T = sc.total;
  const wp = sc.walkTotal[0] ? sc.walkTotal[1] / sc.walkTotal[0] : 0;
  const dash = <span className="text-gray-400">–</span>;
  const rangeText = filters.date[0] || filters.date[1] ? `${dlabel(sc.rng[0])} – ${dlabel(sc.rng[1])}` : `all ${ds.days} days`;
  const td = 'px-2.5 py-2 border-b border-gray-100 whitespace-nowrap tabular-nums text-right';
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  const title = filterTitle(ds, filters);

  return (
    <div className="space-y-4">
      <div className={`${KPI_GRID} md:grid-cols-5`}>
        <Kpi label="BMs" value={fmt(sc.list.length)} accent={INK} title="People who wrote remarks in these filters"
          sub={`${fmt(sc.rankedCount)} ranked (${rankMin}+ leads scored) · ${rangeText}`} />
        <Kpi label="Avg remark score" accent={INK} color={T.n ? avgColor(T.avg) : MUTED} title="Average pointers covered per lead, out of 4"
          value={T.n ? <>{avg1(T.avg)} <small className="text-[15px] text-gray-400 font-semibold">/ 4</small></> : '–'} sub={`${fmt(T.n)} leads scored`} />
        <Kpi label="Leads with all 4" accent={SCORE_COLORS[4]} color={SCORE_COLORS[4]} value={pctText(T.d[4], T.n)} sub={count(T.d[4], 'leads')} />
        <Kpi label="Leads with none" accent={SCORE_COLORS[0]} color={SCORE_COLORS[0]} value={pctText(T.d[0], T.n)} sub={count(T.d[0], 'leads')} />
        <Kpi label="Walk-ins remarked same day" color={sc.walkTotal[0] ? walkinColor(wp) : MUTED} value={pctText(sc.walkTotal[1], sc.walkTotal[0])}
          title="Walk-in customers (with a cart) who got a typed remark on their lead the same day"
          sub={`${fmt(sc.walkTotal[1])} of ${fmt(sc.walkTotal[0])} walk-ins${sc.rng[0] < sc.walkinsFrom ? ` · walk-in data from ${dlabel(sc.walkinsFrom)}` : ''}`} />
      </div>

      <Panel title="BM scorecard"
        hint={`Quality = avg pointers (Need / Stuck / Who / Next + date) covered per lead, on the remarks this BM wrote · Walk-ins = walk-in customers on leads they own that got a remark the same day · Δ = vs the previous ${sc.span} days · click a row for their remarks`}
        right={
          <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
            Rank BMs with
            <input type="number" min={1} value={rankMin} onChange={e => { const v = parseInt(e.target.value, 10); if (v > 0) setRankMin(v); }}
              aria-label="Minimum leads to be ranked" className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-[12px] tabular-nums" />
            + leads
          </label>
        }>
        <TableScroll>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {COLS.map(([k, label, left, tip]) => (
                  <SortTh key={k} k={k} label={label} left={left} title={tip} sort={sort} onSort={key => setSort(s => nextSort(s, key, ['name', 'ec', 'qr']))} />
                ))}
                <Th left label={`Last ${sc.days.length} days (avg score per day)`} title="Red = 0, cream = 2, green = 4; grey = no remarks" />
              </tr>
            </thead>
            <tbody>
              {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(x => {
                const dl = x.prev === null ? null : x.avg - x.prev;
                return (
                  <tr key={x.k} className={ROW}
                    {...activate(() => onDrill({ title: `${x.name} · ${title}`, match: r => r.author === x.k, group: 'lead' }))}>
                    <td className={td}>{x.qr ? <b>#{x.qr}</b> : dash}</td>
                    <td className={`${td} !text-left`}><b>{x.name}</b>{x.qr && x.qr <= 3 && <span className="text-amber-500"> ★</span>}</td>
                    <td className={`${td} !text-left text-[12px] text-gray-500`}>{x.ec}</td>
                    <td className={td}>{fmt(x.L.n)}</td>
                    <td className={td}>{x.L.n ? <><b style={{ color: avgColor(x.avg) }}>{avg1(x.avg)}</b><span className="text-gray-400 text-[12px] ml-1">/ 4</span></> : dash}</td>
                    <td className={td}>
                      {dl === null || !x.L.n ? dash : (
                        <span className="font-bold" style={{ color: dl >= 0.05 ? SCORE_COLORS[4] : dl <= -0.05 ? SCORE_COLORS[0] : MUTED }}>
                          {dl >= 0.05 ? '▲ +' : dl <= -0.05 ? '▼ ' : '● '}{Math.abs(dl) < 0.05 ? '0.0' : avg1(Math.abs(dl))}
                        </span>
                      )}
                    </td>
                    {x.L.n ? (
                      <>
                        <td className={`${td} font-semibold`} style={{ color: SCORE_COLORS[4] }}>{pc(x.all4)}</td>
                        <td className={`${td} font-semibold`} style={{ color: SCORE_COLORS[0] }}>{pc(x.none)}</td>
                        {x.cov.map((v, i) => <td key={i} className={`${td} font-semibold`} style={{ color: coverageColor(v * 100) }}>{pc(v)}</td>)}
                      </>
                    ) : [...Array(6)].map((_, i) => <td key={i} className={td}>{dash}</td>)}
                    <td className={td}>
                      {x.wa ? <><b style={{ color: walkinColor(x.wp!) }}>{fmt(x.wr)}/{fmt(x.wa)}</b><span className="text-gray-400 text-[12px] ml-1">{pc(x.wp!)}</span></> : dash}
                    </td>
                    <td className="px-2.5 py-2 border-b border-gray-100">
                      <div className="flex gap-0.5">
                        {sc.days.map(d => {
                          const lm = sc.daily.get(`${x.k}|${d}`);
                          if (!lm) return <i key={d} className="block w-[13px] h-[18px] rounded-sm bg-gray-100" title={`${dlabel(d)}: no remarks`} />;
                          const L = leadStats(lm);
                          return <i key={d} className="block w-[13px] h-[18px] rounded-sm" style={{ background: goodBadHeat(L.avg / 4) }} title={`${dlabel(d)}: ${avg1(L.avg)} / 4 · ${fmt(L.n)} leads`} />;
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <Pager page={page} total={sorted.length} onPage={setPage} />
      </Panel>
      <p className={NOTE}>
        Ranked = BMs with {rankMin}+ leads scored in the range (★ = top 3). Lead score = pointers covered by this BM&apos;s best single remark on that lead in the range
        (or all remarks combined, per the toggle on the Dashboard tab). Walk-in data covers the last {WALKIN_DAYS} days. Daily strip: red = 0, cream = 2, green = 4; grey = no remarks.
      </p>
    </div>
  );
}
