'use client';

import { useMemo } from 'react';

import { BNAME, BUCKET_COLORS, PNAME, SCORE_COLORS } from '../../constants';
import type { Group, Remark, ScoreCtx, ScoreMode } from '../../types';
import { aggregate } from '../../utils/aggregate';
import { DOW, dayOfWeek, dlabel } from '../../utils/dates';
import { avg1, fmt, pct, pctText } from '../../utils/format';
import { FOCUS, Legend, Panel, activate } from '../../ui';

function dayLabel(d: string, many: boolean) {
  if (!many) return <>{dlabel(d).split(' ')[0]}<br />{dlabel(d).split(' ')[1]}</>;
  const dt = new Date(`${d}T00:00:00`);
  return dt.getDate() === 1 || dt.getDay() === 1 ? dlabel(d) : '';
}

function tooltip(d: string, g: Group<string> | undefined, mode: ScoreMode) {
  const head = `${dlabel(d)} (${DOW[dayOfWeek(d)]})`;
  if (!g) return `${head}\nno remarks`;
  if (mode === 'pt') {
    const L = g.L;
    return [head, `${fmt(L.n)} leads · avg ${avg1(L.avg)} / 4`, ...[4, 3, 2, 1, 0].map(s => `${s} of 4: ${fmt(L.d[s])} (${pctText(L.d[s], L.n)})`),
      PNAME.map((x, i) => `${x} ${pctText(L.cov[i], L.n)}`).join(' · ')].join('\n');
  }
  return [head, `${fmt(g.n)} remarks`, ...BNAME.map((x, i) => `${x} ${fmt(g.b[i])} (${pctText(g.b[i], g.n)})`), `Copy-pasted ${fmt(g.cp)} (${pctText(g.cp, g.n)})`].join('\n');
}

export function DayTrend({ days, rows, ctx, mode, onDay }: {
  days: string[];
  rows: Remark[];
  ctx: ScoreCtx;
  mode: ScoreMode;
  onDay: (d: string) => void;
}) {
  const byDay = useMemo(() => new Map(aggregate(rows, r => r.day, ctx).map(g => [g.k, g])), [rows, ctx]);
  const size = (g?: Group<string>) => (g ? (mode === 'pt' ? g.L.n : g.n) : 0);
  const peak = Math.max(1, ...days.map(d => size(byDay.get(d))));
  const many = days.length > 45;

  return (
    <Panel title="Day by day"
      hint={mode === 'pt'
        ? "Leads remarked on each day, split by how many of the 4 pointers that day's remarks covered · bar label = avg score · click a day for its remarks"
        : 'Remarks per day split by quality · bar label = % sufficient + detailed · click a day for its remarks'}>
      <div className="flex items-end gap-[3px] h-[220px] px-4 pt-2.5 overflow-x-auto">
        {days.map(d => {
          const g = byDay.get(d);
          const label = !g ? '' : mode === 'pt' ? (g.L.n ? avg1(g.L.avg) : '') : g.n ? `${Math.round(pct(g.b[2] + g.b[3], g.n))}%` : '';
          const parts = mode === 'pt'
            ? [4, 3, 2, 1, 0].map(i => [g ? g.L.d[i] : 0, SCORE_COLORS[i]] as const)
            : [3, 2, 1, 0].map(i => [g ? g.b[i] : 0, BUCKET_COLORS[i]] as const);
          return (
            <div key={d} {...activate(() => onDay(d))} role="button" aria-label={`${dlabel(d)}: see remarks`} title={tooltip(d, g, mode)}
              className={`flex-[1_0_22px] flex flex-col h-full rounded-sm cursor-pointer hover:opacity-80 ${FOCUS}`}>
              <div className="flex-1 flex flex-col justify-end">
                <div className="text-[10px] text-center font-semibold text-gray-900">{label}</div>
                {parts.map(([x, color], i) => <i key={i} className="block" style={{ height: `${(x * 88) / peak}%`, background: color }} />)}
              </div>
              <div className="text-[10px] text-gray-400 text-center pt-1 pb-0.5 whitespace-nowrap">{dayLabel(d, many)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-3.5">
        <Legend items={mode === 'pt'
          ? [4, 3, 2, 1, 0].map(i => [SCORE_COLORS[i], `${i} of 4`] as [string, string])
          : [3, 2, 1, 0].map(i => [BUCKET_COLORS[i], BNAME[i]] as [string, string])} />
        <span className="text-[12px] text-gray-500">Peak day {fmt(peak)} {mode === 'pt' ? 'leads' : 'remarks'} · hover a bar for numbers</span>
      </div>
    </Panel>
  );
}
