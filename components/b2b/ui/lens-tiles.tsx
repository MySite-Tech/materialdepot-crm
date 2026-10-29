'use client';

export interface LensTile<K extends string> {
  key: K;
  title: string;
  rule: string;
  accent: string;
  value: string;
  sub?: string;
  warn?: boolean;
  muted?: boolean;
}

export interface LensTileGroup<K extends string> {
  title: string;
  head?: { key: K; label: string; rule: string };
  tiles: LensTile<K>[];
}

export interface LensPill<K extends string> {
  key: K;
  title: string;
  rule: string;
  count?: number;
}

export function LensTiles<K extends string>({ groups, active, onPick }: {
  groups: LensTileGroup<K>[];
  active: K | null;
  onPick: (lens: K) => void;
}) {
  return (
    <div className="flex flex-col xl:flex-row gap-3 mb-3">
      {groups.map((g) => {
        const headOn = !!g.head && active === g.head.key;
        return (
          <section
            key={g.title}
            style={{ flex: g.tiles.length }}
            className={`bg-white rounded-lg border min-w-0 overflow-hidden ${headOn ? 'border-gray-800' : 'border-gray-200'}`}
          >
            <div className="px-2 pt-2 flex items-center">
              {g.head ? (
                <button
                  onClick={() => onPick(g.head!.key)}
                  title={g.head.rule}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${headOn ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  {g.head.label}
                </button>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g.title}</span>
              )}
            </div>
            <div
              className={`grid ${g.tiles.length >= 4 ? 'grid-cols-2 sm:[grid-template-columns:var(--cols)]' : '[grid-template-columns:var(--cols)]'}`}
              style={{ '--cols': `repeat(${g.tiles.length}, minmax(0, 1fr))` } as React.CSSProperties}
            >
              {g.tiles.map((t) => {
                const on = active === t.key || headOn;
                return (
                  <button
                    key={t.key}
                    onClick={() => onPick(t.key)}
                    title={t.rule}
                    className={`relative text-left px-3.5 pt-1 pb-3 min-w-0 border-l border-gray-100 first:border-l-0 transition-colors ${active === t.key ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.accent }} />
                      <span className={`text-[11.5px] font-semibold leading-tight line-clamp-2 ${on ? 'text-gray-900' : 'text-gray-500'}`}>{t.title}</span>
                    </div>
                    <div className={`text-[22px] font-bold leading-tight mt-0.5 truncate tabular-nums ${t.muted ? 'text-gray-300' : 'text-gray-900'}`} title={t.value}>
                      {t.value}
                    </div>
                    {t.sub && (
                      <div className={`text-[10.5px] leading-snug line-clamp-2 ${t.warn ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{t.sub}</div>
                    )}
                    {on && <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: t.accent }} />}
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

export function LensPills<K extends string>({ pills, active, onPick }: {
  pills: LensPill<K>[];
  active: K | null;
  onPick: (lens: K) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {pills.map((p) => (
        <button
          key={p.key}
          onClick={() => onPick(p.key)}
          title={p.rule}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border whitespace-nowrap ${active === p.key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
        >
          {p.title}{p.count !== undefined && <span className="tabular-nums opacity-60"> {p.count}</span>}
        </button>
      ))}
    </div>
  );
}
