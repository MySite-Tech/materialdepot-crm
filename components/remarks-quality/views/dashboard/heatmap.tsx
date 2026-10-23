'use client';

import { useEffect, useMemo, useState } from 'react';

import { COUNT_LOW, HEAT_GOOD, HEAT_MID, HEATMAP_DAYS, INK, PAGE_SIZE, PNAME, SCORE_COLORS } from '../../constants';
import type { Group, Remark, ScoreCtx, ScoreMode } from '../../types';
import { aggregate } from '../../utils/aggregate';
import { DOW, dayOfWeek, dlabel } from '../../utils/dates';
import { avg1, fmt, goodBadHeat, mix } from '../../utils/format';
import { FOCUS, Pager, Panel, Seg, activate } from '../../ui';

type Metric = 'avgp' | 'all4' | 'cp' | 'n' | 'good' | 'p0';
type Cell = Group<string>;

const METRICS: Record<ScoreMode, Array<[Metric, string]>> = {
  pt: [['avgp', 'Avg score'], ['all4', '% leads all 4'], ['cp', '% Copy-paste'], ['n', 'Leads']],
  len: [['good', '% Sufficient+'], ['p0', '% Nothing'], ['cp', '% Copy-paste'], ['n', 'Count']],
};

function cellColor(g: Cell, metric: Metric, mode: ScoreMode): [string, string, string] {
  if (metric === 'n') {
    const c = mode === 'pt' ? g.L.n : g.n;
    const t = Math.min(1, c / 25);
    return [mix(COUNT_LOW, INK, t * 0.9), t > 0.5 ? '#fff' : INK, fmt(c)];
  }
  if (metric === 'avgp' || metric === 'all4') {
    const good = metric === 'avgp' ? g.L.avg / 4 : g.L.n ? g.L.d[4] / g.L.n : 0;
    return [goodBadHeat(good), good > 0.8 || good < 0.2 ? '#fff' : INK, metric === 'avgp' ? avg1(g.L.avg) : String(Math.round(good * 100))];
  }
  const v = metric === 'good' ? (g.b[2] + g.b[3]) / g.n : metric === 'cp' ? g.cp / g.n : g.b[0] / g.n;
  const good = metric === 'good' ? v : 1 - v;
  return [goodBadHeat(good), good > 0.8 || good < 0.2 ? '#fff' : INK, String(Math.round(v * 100))];
}

function legend(metric: Metric, mode: ScoreMode) {
  const g3 = `linear-gradient(90deg,${SCORE_COLORS[0]},${HEAT_MID},${HEAT_GOOD})`;
  if (metric === 'n') return { a: 'Fewer', b: `More ${mode === 'pt' ? 'leads' : 'remarks'} (25+)`, bg: `linear-gradient(90deg,${COUNT_LOW},${INK})` };
  if (metric === 'avgp') return { a: '0', b: '4 pointers · cell number = avg pointers covered per lead that day', bg: g3 };
  if (metric === 'all4') return { a: '0%', b: "100% · cell number = % of that day's leads covering all 4", bg: g3 };
  const nm = { good: 'sufficient + detailed', p0: 'nothing', cp: 'copy-pasted' }[metric];
  return metric === 'good'
    ? { a: `0% ${nm}`, b: `100% ${nm} · cell number = % ${nm}`, bg: g3 }
    : { a: `100% ${nm}`, b: `0% ${nm} · cell number = % ${nm}`, bg: g3 };
}

export function Heatmap({ days, rows, ctx, mode, rowKeys, rowName, by, onBy, onCell, onRow, onDay }: {
  days: string[];
  rows: Remark[];
  ctx: ScoreCtx;
  mode: ScoreMode;
  rowKeys: number[];
  rowName: (k: number) => string;
  by: 'bm' | 'ec';
  onBy: (v: 'bm' | 'ec') => void;
  onCell: (k: number, d: string) => void;
  onRow: (k: number) => void;
  onDay: (d: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>(mode === 'pt' ? 'avgp' : 'good');
  const [page, setPage] = useState(1);
  useEffect(() => { setMetric(m => (METRICS[mode].some(x => x[0] === m) ? m : mode === 'pt' ? 'avgp' : 'good')); }, [mode]);
  useEffect(() => { setPage(1); }, [rowKeys, by]);

  const hmDays = days.slice(-HEATMAP_DAYS);
  const from = hmDays[0];
  const to = hmDays[hmDays.length - 1];
  const cells = useMemo(
    () => new Map(aggregate(rows.filter(r => r.day >= from && r.day <= to), r => `${by === 'bm' ? r.author : r.branch}|${r.day}`, ctx).map(g => [g.k, g])),
    [rows, ctx, by, from, to],
  );
  const lg = legend(metric, mode);
  const keys = rowKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Panel title="Who updated properly, on which day"
      hint={`${days.length > HEATMAP_DAYS ? `Showing the last ${HEATMAP_DAYS} days of the range · ` : ''}click a cell to see those remarks · click a name for all their remarks · click a date for that whole day`}
      right={<>
        <Seg value={by} onChange={onBy} options={[['bm', 'By BM'], ['ec', 'By EC']]} />
        <Seg value={metric} onChange={setMetric} options={METRICS[mode]} />
      </>}>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500 px-4 pb-3">
        {lg.a}<span className="inline-block w-32 sm:w-40 h-2.5 rounded" style={{ background: lg.bg }} />{lg.b}
        <span className="inline-flex items-center gap-1.5 ml-2"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-100" />no remarks</span>
      </div>
      <div className="overflow-auto max-h-[620px] overscroll-x-contain">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 bg-gray-50 text-left px-2.5 py-1.5 min-w-[140px] sm:min-w-[180px] border-r border-b border-gray-200 text-gray-400 font-semibold uppercase tracking-wide">{by === 'bm' ? 'BM' : 'Experience Centre'}</th>
              {hmDays.map(d => (
                <th key={d} scope="col" {...activate(() => onDay(d))} title={`Click: everyone's remarks on ${dlabel(d)}`}
                  className={`sticky top-0 z-[1] bg-gray-50 px-0.5 py-1.5 min-w-[38px] text-center font-semibold border-b border-gray-200 cursor-pointer hover:text-gray-900 hover:underline ${FOCUS} ${dayOfWeek(d) === 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {DOW[dayOfWeek(d)][0]}<br />{+d.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k}>
                <th scope="row" {...activate(() => onRow(k))} title="Click: all remarks in the range"
                  className={`sticky left-0 z-10 bg-white px-2.5 py-1 border-r border-gray-200 text-left font-normal whitespace-nowrap max-w-[220px] truncate cursor-pointer hover:bg-amber-50 hover:underline ${FOCUS}`}>{rowName(k)}</th>
                {hmDays.map(d => {
                  const g = cells.get(`${k}|${d}`);
                  if (!g) return <td key={d} className="h-[30px] text-center border border-white bg-gray-50 text-gray-300">·</td>;
                  const [bg, fg, txt] = cellColor(g, metric, mode);
                  const tip = mode === 'pt'
                    ? `${g.L.n} leads · ${g.n} remarks · avg ${avg1(g.L.avg)} / 4\n${[4, 3, 2, 1, 0].map(s => `${s}/4: ${g.L.d[s]}`).join(' · ')}\n${PNAME.map((x, i) => `${x} ${g.L.cov[i]}`).join(' · ')}`
                    : `${g.n} remarks\nNothing ${g.b[0]} · Minimal ${g.b[1]} · Sufficient ${g.b[2]} · Detailed ${g.b[3]}`;
                  return (
                    <td key={d} onClick={() => onCell(k, d)} style={{ background: bg, color: fg }}
                      title={`${rowName(k)} · ${dlabel(d)}\n${tip}\nCopy-pasted ${g.cp}\n▸ Click to see these remarks`}
                      className="h-[30px] min-w-[38px] text-center font-semibold tabular-nums border border-white cursor-pointer hover:outline-2 hover:outline-gray-900">{txt}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={rowKeys.length} onPage={setPage} />
    </Panel>
  );
}
