'use client';

import { OUTREACH_KPIS, OutreachKpiDef, OutreachKpiKey, OutreachKpis, Period, kpiTarget } from '../../../models/outreach/kpis';
import { Lens } from '../types';
import { fmtTarget, fmtValue, paceFor, tileHint, tone } from './utils';

function KpiTile({ def, k, heads, period, today, state, on, onPick }: {
  def: OutreachKpiDef;
  k: OutreachKpis[OutreachKpiKey];
  heads: number;
  period: Period;
  today: string;
  state: 'ready' | 'loading' | 'failed';
  on: boolean;
  onPick: () => void;
}) {
  const target = kpiTarget(def, heads, period);
  const pace = target === null ? null : paceFor(def, period, today);
  const ready = state === 'ready';
  const t = tone(ready ? k.value : null, target, pace);
  const width = !ready || k.value === null || !target ? 0 : Math.min(100, Math.round((k.value / target) * 100));
  const hint = ready ? tileHint(def, k) : undefined;
  const title = [
    `${def.label} — ${def.rule}`,
    pace !== null && target !== null && k.value !== null ? `On pace: ${def.unit === 'L' ? `₹${Math.round(target * pace * 10) / 10}L` : Math.round(target * pace)} by today.` : '',
    target === null ? 'No target for a custom period — the sheet sets monthly targets.' : '',
    ready ? k.sub : '',
    'Click to see the leads behind this number.',
  ].filter(Boolean).join('\n');

  return (
    <button
      onClick={onPick}
      title={title}
      className={`relative text-left px-3.5 pt-1 pb-3 min-w-0 border-l border-gray-100 first:border-l-0 transition-colors ${on ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
    >
      <div className={`text-[11.5px] font-semibold truncate ${on ? 'text-gray-900' : 'text-gray-500'}`}>{def.short}</div>
      <div className="flex items-baseline gap-1 mt-0.5 min-w-0">
        <span className={`${ready && k.value === null && def.key === 'waitlist' ? 'text-[18px] leading-[27.5px]' : 'text-[22px] leading-tight'} font-bold tabular-nums truncate ${ready ? t.text : 'text-gray-300'}`}>
          {state === 'loading' ? '…' : state === 'failed' ? 'Unknown' : fmtValue(def, k.value)}
        </span>
        {target !== null && (!ready || k.value !== null) && <span className="text-[11px] text-gray-400 whitespace-nowrap">/ {fmtTarget(def, target)}</span>}
      </div>
      <div className="relative h-1 rounded bg-gray-100 mt-1.5">
        <div className="h-full rounded" style={{ width: `${width}%`, background: t.bar }} />
        {pace !== null && ready && <span className="absolute -top-[3px] w-[2px] h-[10px] rounded bg-gray-500" style={{ left: `calc(${Math.round(pace * 100)}% - 1px)` }} />}
      </div>
      <div className={`text-[10.5px] truncate h-[15px] mt-1 ${hint?.warn ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{hint?.text}</div>
      {on && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#1A1A1A]" />}
    </button>
  );
}

export function Scorecard({ kpis, heads, period, today, state, active, onPick }: {
  kpis: OutreachKpis;
  heads: number;
  period: Period;
  today: string;
  state: 'ready' | 'loading' | 'failed';
  active: Lens | null;
  onPick: (lens: Lens) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {(['Effort', 'Output'] as const).map((kind) => (
        <section key={kind} className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
          <div className="px-3.5 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{kind}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {OUTREACH_KPIS.filter((d) => d.kind === kind).map((d) => (
              <KpiTile
                key={d.key}
                def={d}
                k={kpis[d.key]}
                heads={heads}
                period={period}
                today={today}
                state={state}
                on={active === `kpi:${d.key}`}
                onPick={() => onPick(`kpi:${d.key}`)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
