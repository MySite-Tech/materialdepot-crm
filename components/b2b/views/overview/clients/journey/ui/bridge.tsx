'use client';

import type { Journey } from '@/lib/b2b/revenue/journey';
import { fmtL } from '../../../../../models/mock-data';
import { BRIDGE_LABEL, COLOR } from '../constants';
import { FirmFocus, monthName, signedL } from '../utils';

interface Col {
  id: string;
  label: string;
  sub: string;
  from: number;
  to: number;
  color: string;
  value: string;
  focus: FirmFocus | null;
}

export function Bridge({ journey, focus, onFocus }: { journey: Journey; focus: FirmFocus | null; onFocus: (f: FirmFocus | null) => void }) {
  let run = journey.startValue;
  const cols: Col[] = [
    { id: 'start', label: `${monthName(journey.a)} revenue`, sub: '', from: 0, to: run, color: COLOR.total, value: fmtL(run), focus: null },
    ...journey.bridge.map((s): Col => {
      const from = run;
      run += s.value;
      return {
        id: s.key, label: BRIDGE_LABEL[s.key], sub: `${s.firms} ${s.firms === 1 ? 'firm' : 'firms'}`, from, to: run,
        color: s.value < 0 ? COLOR.loss : COLOR.gain, value: signedL(s.value),
        focus: { kind: 'bridge', key: s.key, label: BRIDGE_LABEL[s.key] },
      };
    }),
    { id: 'end', label: `${monthName(journey.b)} revenue`, sub: '', from: 0, to: journey.endValue, color: COLOR.total, value: fmtL(journey.endValue), focus: null },
  ];
  const top = Math.max(...cols.map((c) => Math.max(c.from, c.to)), 1);
  const y = (v: number) => 100 - (100 * v) / top;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-1.5 min-w-[720px]">
        {cols.map((c, i) => {
          const active = focus?.kind === 'bridge' && c.focus?.kind === 'bridge' && focus.key === c.focus.key;
          const dim = focus?.kind === 'bridge' && !active;
          const hi = Math.max(c.from, c.to);
          const lo = Math.min(c.from, c.to);
          const clickable = !!c.focus;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!clickable}
              onClick={() => c.focus && onFocus(active ? null : c.focus)}
              className={`flex-1 min-w-0 flex flex-col items-stretch rounded-lg px-1 pt-1 pb-2 text-left transition ${clickable ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'} ${active ? 'bg-gray-100 ring-1 ring-gray-300' : ''} ${dim ? 'opacity-40' : ''}`}
            >
              <div className="relative h-[180px] mt-5">
                <div className="absolute inset-x-0 border-b border-gray-200" style={{ top: '100%' }} />
                {i < cols.length - 1 && (
                  <div className="absolute border-t border-dashed border-gray-300" style={{ top: `${y(c.to)}%`, left: '82%', right: 'calc(-18% - 14px)' }} />
                )}
                <div
                  className="absolute left-[18%] right-[18%] rounded-[4px]"
                  style={{ top: `${y(hi)}%`, height: `max(2px, ${y(lo) - y(hi)}%)`, background: c.color }}
                />
                <div className="absolute inset-x-0 text-center tabular-nums text-[11px] font-bold text-gray-800" style={{ top: `calc(${y(hi)}% - 16px)` }}>{c.value}</div>
              </div>
              <div className="mt-1.5 text-[10.5px] leading-tight font-semibold text-gray-700 text-center">{c.label}</div>
              {c.sub && <div className="text-[10px] text-gray-400 text-center tabular-nums">{c.sub}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
