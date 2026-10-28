'use client';

import { LENS } from '../constants';
import { Lens, LensGroup, WorkLens } from '../types';

export interface TileHint {
  text: string;
  warn?: boolean;
}

const COLS: Record<number, string> = {
  2: 'grid-cols-2',
  4: 'grid-cols-2 sm:grid-cols-4',
  6: 'grid-cols-3 sm:grid-cols-6',
};

export function LensStrip({ groups, counts, hints, state, active, onPick }: {
  groups: LensGroup[];
  counts: Partial<Record<WorkLens, number>>;
  hints: Partial<Record<WorkLens, TileHint>>;
  state: 'ready' | 'loading' | 'failed';
  active: Lens | null;
  onPick: (lens: WorkLens) => void;
}) {
  const shown = (k: WorkLens) => (state === 'loading' ? '…' : state === 'failed' ? '?' : String(counts[k] ?? 0));
  return (
    <div className="flex flex-col min-[1400px]:flex-row gap-3 mb-4">
      {groups.map((g) => {
        const headOn = !!g.head && active === g.head;
        return (
          <section
            key={g.title}
            style={{ flex: g.weight }}
            className={`bg-white rounded-lg border min-w-0 overflow-hidden ${headOn ? 'border-gray-800' : 'border-gray-200'}`}
          >
            <div className="px-2 pt-2 flex items-center">
              {g.head ? (
                <button
                  onClick={() => onPick(g.head as WorkLens)}
                  title={LENS[g.head].rule}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${headOn ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  {g.title} · {shown(g.head)}
                </button>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.title}</span>
              )}
            </div>
            <div className={`grid ${COLS[g.lenses.length] ?? 'grid-cols-2'}`}>
              {g.lenses.map((k, i) => {
                const on = active === k;
                const n = counts[k] ?? 0;
                const hint = state === 'ready' ? hints[k] : undefined;
                return (
                  <button
                    key={k}
                    onClick={() => onPick(k)}
                    title={LENS[k].rule}
                    className={`relative text-left px-3 pt-1 pb-3 min-w-0 border-l border-gray-100 first:border-l-0 transition-colors ${on ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    {g.flow && i > 0 && (
                      <span aria-hidden className="hidden sm:block absolute -left-[5px] top-[22px] text-[11px] leading-none text-gray-300 bg-white">›</span>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: LENS[k].accent }} />
                      <span className={`text-[11.5px] font-semibold truncate ${on ? 'text-gray-900' : 'text-gray-500'}`}>{LENS[k].title}</span>
                    </div>
                    <div className={`text-[22px] font-bold leading-tight mt-0.5 tabular-nums truncate ${state !== 'ready' ? 'text-gray-300' : n ? 'text-gray-900' : 'text-gray-300'}`}>
                      {shown(k)}
                    </div>
                    <div className={`text-[10.5px] truncate h-[15px] ${hint?.warn ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{hint?.text}</div>
                    {on && <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: LENS[k].accent }} />}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
