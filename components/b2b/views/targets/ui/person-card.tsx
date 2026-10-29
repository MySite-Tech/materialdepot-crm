'use client';

import { Period } from '../../../models/outreach/kpis';
import { PerfCard, PerfKpiDef } from '../../../models/performance/types';
import { fmtNumber, fmtValue, paceFor, tone } from '../../../models/performance/utils';
import { ReactNode, useEffect, useState } from 'react';

const UNIT_SUFFIX: Record<PerfKpiDef['unit'], string> = { count: '', '%': '%', L: 'L' };

function GoalInput({ value, sheet, onSave }: { value: number; sheet: number; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n) || n < 0) { setDraft(String(value)); return; }
    if (n !== value) onSave(n === sheet ? null : n);
  };
  return (
    <input type="number" min={0} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-16 px-1.5 py-0.5 text-[12px] text-right font-mono border border-gray-200 rounded outline-none focus:border-[#0F766E]" />
  );
}

function KpiLine({ def, card, target, period, today, loading, onSave }: {
  def: PerfKpiDef;
  card: PerfCard;
  target: number | null;
  period: Period;
  today: string;
  loading: boolean;
  onSave?: (v: number | null) => void;
}) {
  const k = card[def.key];
  const pace = paceFor(def, period, today);
  const t = tone(loading ? null : k.value, target, pace);
  const width = loading || k.value === null || !target ? 0 : Math.min(100, Math.round((k.value / target) * 100));
  const changed = !!onSave && target !== null && def.target !== null && target !== def.target;

  return (
    <div title={[def.rule, k.sub].filter(Boolean).join('\n')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-600 truncate">
          {def.label}
          {changed && <span className="ml-1.5 text-[10px] text-gray-400">sheet {fmtNumber(def, def.target as number)}</span>}
        </span>
        <span className="flex items-center gap-1 text-[12px] shrink-0">
          <span className={`font-mono font-semibold ${loading ? 'text-gray-300' : t.text}`}>{loading ? '…' : fmtValue(def, k)}</span>
          <span className="text-gray-300">/</span>
          {target === null ? <span className="text-gray-400">no target</span>
            : onSave && def.target !== null ? <GoalInput value={target} sheet={def.target} onSave={onSave} />
              : <span className="font-mono text-gray-500">{fmtNumber(def, target)}</span>}
          {onSave && target !== null && UNIT_SUFFIX[def.unit] && <span className="text-gray-400">{UNIT_SUFFIX[def.unit]}</span>}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gray-100 mt-1.5">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${width}%`, background: t.bar }} />
        {pace !== null && target !== null && !loading && <span className="absolute -top-[2px] w-[2px] h-[10px] rounded bg-gray-500" style={{ left: `calc(${Math.round(pace * 100)}% - 1px)` }} />}
      </div>
    </div>
  );
}

export function PersonCard({ title, badge, defs, card, targetOf, period, today, loading, onSave }: {
  title: string;
  badge?: ReactNode;
  defs: PerfKpiDef[];
  card: PerfCard;
  targetOf: (def: PerfKpiDef) => number | null;
  period: Period;
  today: string;
  loading: (key: string) => boolean;
  onSave?: (def: PerfKpiDef, v: number | null) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-bold text-gray-800 truncate">{title}</span>
        {badge}
      </div>
      {(['Effort', 'Output'] as const).map((kind) => (
        <div key={kind} className="mb-3 last:mb-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{kind}</div>
          <div className="flex flex-col gap-3">
            {defs.filter((d) => d.kind === kind).map((d) => (
              <KpiLine key={d.key} def={d} card={card} target={targetOf(d)} period={period} today={today}
                loading={loading(d.key)} onSave={onSave && ((v) => onSave(d, v))} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
