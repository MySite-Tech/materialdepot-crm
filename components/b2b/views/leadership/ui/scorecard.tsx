'use client';

import { Period } from '../../../models/outreach/kpis';
import { Goals, PerfCard, PerfKpiDef, PerfValue, Person } from '../../../models/performance/types';
import { counted, elapsedDays, fmtNumber, fmtValue, paceFor, targetFor, tone } from '../../../models/performance/utils';
import { Pager } from '../../kams/ui';
import { PAGE_SIZE } from '../constants';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { fmtDay } from '../utils';
import { useEffect, useMemo, useState } from 'react';

function hintFor(def: PerfKpiDef, k: PerfValue, days: number): { text: string; warn?: boolean } | undefined {
  if (k.unknown) return { text: 'Not readable', warn: true };
  if (k.value === null) return { text: 'none in period' };
  if (def.per === 'day' && days > 1) return { text: `${Math.round((k.value / days) * 10) / 10} a day` };
  if (def.unit === '%') return { text: k.rows.length ? `${counted(k.rows)} of ${k.rows.length}` : 'none in period' };
  const missed = k.rows.length - counted(k.rows);
  if (missed) return { text: `+${missed} not counted`, warn: true };
  return undefined;
}

function Tile({ def, k, target, period, today, loading, on, onPick }: {
  def: PerfKpiDef; k: PerfValue; target: number | null; period: Period; today: string; loading: boolean; on: boolean; onPick: () => void;
}) {
  const pace = paceFor(def, period, today);
  const t = tone(loading ? null : k.value, target, pace);
  const width = loading || k.value === null || !target ? 0 : Math.min(100, Math.round((k.value / target) * 100));
  const hint = loading ? undefined : hintFor(def, k, elapsedDays(period, today).length);
  const title = [
    `${def.label}: ${def.rule}`,
    target === null && def.target !== null ? 'No target for a part-month period: the sheet sets monthly targets.' : '',
    loading ? '' : k.sub,
    'Click to see what is behind this number.',
  ].filter(Boolean).join('\n');

  return (
    <button onClick={onPick} title={title}
      className={`relative text-left px-3.5 pt-1 pb-3 min-w-0 border-l border-gray-100 first:border-l-0 transition-colors ${on ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
      <div className={`text-[11.5px] font-semibold truncate ${on ? 'text-gray-900' : 'text-gray-500'}`}>{def.short}</div>
      <div className="flex items-baseline gap-1 mt-0.5 min-w-0">
        <span className={`text-[22px] leading-tight font-bold tabular-nums truncate ${loading ? 'text-gray-300' : t.text}`}>
          {loading ? '…' : fmtValue(def, k)}
        </span>
        {target !== null && k.value !== null && !loading && <span className="text-[11px] text-gray-400 whitespace-nowrap">/ {fmtNumber(def, target)}</span>}
      </div>
      <div className="relative h-1 rounded bg-gray-100 mt-1.5">
        <div className="h-full rounded" style={{ width: `${width}%`, background: t.bar }} />
        {pace !== null && !loading && <span className="absolute -top-[3px] w-[2px] h-[10px] rounded bg-gray-500" style={{ left: `calc(${Math.round(pace * 100)}% - 1px)` }} />}
      </div>
      <div className={`text-[10.5px] truncate h-[15px] mt-1 ${hint?.warn ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{hint?.text}</div>
      {on && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#1A1A1A]" />}
    </button>
  );
}

export function Scorecard({ defs, card, team, people, goals, period, today, loading, active, onPick }: {
  defs: PerfKpiDef[];
  card: PerfCard;
  team: B2BTeam;
  people: Person[];
  goals: Goals;
  period: Period;
  today: string;
  loading: (key: string) => boolean;
  active: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {(['Effort', 'Output'] as const).map((kind) => {
        const list = defs.filter((d) => d.kind === kind);
        return (
          <section key={kind} className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
            <div className="px-3.5 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{kind}</div>
            <div className={`grid grid-cols-2 ${list.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {list.map((d) => (
                <Tile key={d.key} def={d} k={card[d.key]} target={targetFor(d, team, people, goals, period, today)} period={period} today={today}
                  loading={loading(d.key)} on={active === d.key} onPick={() => onPick(d.key)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function RowsPanel({ def, k, who, onClose }: { def: PerfKpiDef; k: PerfValue; who: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const rows = useMemo(() => [...k.rows].sort((a, b) => Number(b.counts) - Number(a.counts) || String(b.at || '').localeCompare(String(a.at || ''))), [k.rows]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [def.key, who]);

  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-gray-900">{def.label} · {who}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{def.rule}</div>
          {k.sub && <div className="text-[11px] text-gray-400 mt-0.5">{k.sub}</div>}
        </div>
        <button onClick={onClose} className="shrink-0 text-[12px] font-semibold text-gray-400 hover:text-gray-700">Close ×</button>
      </div>
      {rows.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-wider text-gray-400 bg-gray-50/60">
                  <th className="text-left font-bold px-4 py-2">Item</th>
                  <th className="text-left font-bold px-3 py-2">Date</th>
                  <th className="text-left font-bold px-3 py-2">Why</th>
                  <th className="text-right font-bold px-4 py-2">Counted</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE).map((r) => (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-800 max-w-[260px] truncate">{r.title}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.at ? fmtDay(String(r.at).slice(0, 10)) : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.note}</td>
                    <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${r.counts ? 'text-green-700' : 'text-amber-600'}`}>{r.counts ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={rows.length} page={cur} pages={pages} size={PAGE_SIZE} setPage={setPage} />
        </>
      ) : (
        <p className="px-4 py-6 text-center text-[12px] text-gray-400">
          {k.unknown ? 'This number could not be read, so there is nothing to list.' : 'Nothing in this period.'}
        </p>
      )}
    </section>
  );
}
