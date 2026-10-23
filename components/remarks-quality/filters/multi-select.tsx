'use client';

import { useMemo, useState } from 'react';

import type { Dataset, Filters } from '../types';
import { MultiDef, optionCounts, optionLabel } from '../utils/filtering';
import { fmt } from '../utils/format';
import { Popover } from './popover';

function Options({ ds, filters, def, onChange, close }: {
  ds: Dataset;
  filters: Filters;
  def: MultiDef;
  onChange: (v: Array<number | string>) => void;
  close: () => void;
}) {
  const [q, setQ] = useState('');
  const selected = filters[def.k] as Array<number | string>;
  const counts = useMemo(() => optionCounts(ds, filters, def), [ds, filters, def]);
  const options = useMemo(() => {
    const keys = new Set<number | string>([...counts.keys(), ...selected]);
    return [...keys]
      .map(v => ({ v, l: optionLabel(ds, def, v), n: counts.get(v) || 0 }))
      .sort((a, b) => b.n - a.n || a.l.localeCompare(b.l));
  }, [counts, selected, ds, def]);
  const shown = q ? options.filter(o => o.l.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: number | string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <>
      {options.length > 8 && (
        <input autoFocus type="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
          aria-label={`Search ${def.label}`} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 mb-2 text-[12px]" />
      )}
      <div className="max-h-[300px] overflow-auto">
        {shown.map(o => (
          <label key={String(o.v)} className="flex gap-2 items-center px-1 py-1 rounded hover:bg-gray-50 cursor-pointer whitespace-nowrap text-[12px]">
            <input type="checkbox" checked={selected.includes(o.v)} onChange={() => toggle(o.v)} className="accent-amber-500" />
            <span className="min-w-0 truncate" title={o.l}>{o.l}</span>
            <span className="ml-auto pl-3 text-gray-400 tabular-nums">{fmt(o.n)}</span>
          </label>
        ))}
        {!shown.length && <div className="text-[12px] text-gray-400 px-1 py-2">{q ? 'No options match' : 'No options'}</div>}
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 text-[12px] text-gray-500">
        <button className="cursor-pointer hover:text-gray-900" onClick={() => onChange([])}>Clear</button>
        <button className="cursor-pointer hover:text-gray-900" onClick={close}>Close</button>
      </div>
    </>
  );
}

export function MultiSelect({ ds, filters, def, onChange }: {
  ds: Dataset;
  filters: Filters;
  def: MultiDef;
  onChange: (v: Array<number | string>) => void;
}) {
  const selected = filters[def.k] as Array<number | string>;
  return (
    <Popover trigger={def.label} active={selected.length > 0} count={selected.length}>
      {close => <Options ds={ds} filters={filters} def={def} onChange={onChange} close={close} />}
    </Popover>
  );
}
