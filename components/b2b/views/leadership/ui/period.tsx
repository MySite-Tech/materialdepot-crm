'use client';

import { Period } from '../../../models/outreach/kpis';
import { PRESETS } from '../constants';

const dateCls = 'px-2 py-1 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:border-[#0F766E]';

export function PeriodPicker({ value, onChange, custom, setCustom, today }: {
  value: string;
  onChange: (key: string) => void;
  custom: Period;
  setCustom: (p: Period) => void;
  today: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div role="radiogroup" aria-label="Period" className="inline-flex flex-wrap rounded-lg bg-gray-100 p-0.5">
        {PRESETS.map((o) => (
          <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md cursor-pointer whitespace-nowrap transition-colors ${value === o.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={dateCls} />
          <span className="text-[11px] text-gray-400">to</span>
          <input type="date" aria-label="To" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={dateCls} />
        </div>
      )}
    </div>
  );
}
