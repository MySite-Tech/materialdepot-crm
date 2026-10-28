'use client';

import { LENS, LENS_GROUPS, SIDE_LENSES } from '../constants';
import { Lens } from '../types';

export function EnqIdChip({ id }: { id?: string }) {
  if (!String(id || '').trim()) {
    return <span className="text-[10px] font-semibold text-amber-600">No Enq ID</span>;
  }
  return (
    <span className="text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
      {id}
    </span>
  );
}

export interface TileFigure {
  value: string;
  sub: string;
  warn?: boolean;
}

export function LensTiles({ counts, figures, unknown, active, onPick }: {
  counts: Record<Lens, number>;
  figures: Partial<Record<Lens, TileFigure>>;
  unknown: 'pending' | 'failed' | null;
  active: Lens | null;
  onPick: (lens: Lens) => void;
}) {
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-[3fr_3fr_2fr] mb-3">
      {LENS_GROUPS.map((g, gi) => {
        const headOn = !!g.head && active === g.head;
        return (
          <section
            key={g.title}
            className={`bg-white rounded-lg border min-w-0 overflow-hidden ${headOn ? 'border-gray-800' : 'border-gray-200'} ${gi === LENS_GROUPS.length - 1 ? 'md:col-span-2 xl:col-span-1' : ''}`}
          >
            <div className="px-2 pt-2 flex items-center">
              {g.head ? (
                <button
                  onClick={() => onPick(g.head as Lens)}
                  title={LENS[g.head].rule}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${headOn ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  {g.title}{unknown ? '' : ` · ${counts[g.head]}`}
                </button>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.title}</span>
              )}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${g.lenses.length}, minmax(0, 1fr))` }}>
              {g.lenses.map((k) => {
                const on = active === k || headOn;
                const fig: TileFigure | undefined = unknown === 'pending' ? { value: '…', sub: 'loading' }
                  : unknown === 'failed' ? { value: 'Unknown', sub: 'leads did not load' }
                    : figures[k];
                const value = fig?.value ?? String(counts[k]);
                return (
                  <button
                    key={k}
                    onClick={() => onPick(k)}
                    title={LENS[k].rule}
                    className={`relative text-left px-3.5 pt-1 pb-3 min-w-0 border-l border-gray-100 first:border-l-0 transition-colors ${active === k ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: LENS[k].accent }} />
                      <span className={`text-[11.5px] font-semibold truncate ${on ? 'text-gray-900' : 'text-gray-500'}`}>{LENS[k].title}</span>
                    </div>
                    <div className={`text-[22px] font-bold leading-tight mt-0.5 truncate tabular-nums ${counts[k] || unknown ? 'text-gray-900' : 'text-gray-300'} ${unknown ? 'opacity-40' : ''}`} title={value}>
                      {value}
                    </div>
                    {fig?.sub && (
                      <div className={`text-[10.5px] truncate ${fig.warn ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{fig.sub}</div>
                    )}
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

export function LensPills({ counts, hideCounts, active, onPick }: {
  counts: Record<Lens, number>;
  hideCounts: boolean;
  active: Lens | null;
  onPick: (lens: Lens) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {SIDE_LENSES.map((k) => (
        <button
          key={k}
          onClick={() => onPick(k)}
          title={LENS[k].rule}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border whitespace-nowrap ${active === k ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
        >
          {LENS[k].title}{!hideCounts && <span className="tabular-nums opacity-60"> {counts[k]}</span>}
        </button>
      ))}
    </div>
  );
}
