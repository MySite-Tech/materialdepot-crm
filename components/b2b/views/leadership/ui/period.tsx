'use client';

import { Period } from '../../../models/outreach/kpis';
import { PRESETS } from '../constants';

const control = 'px-2 py-1 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-700 outline-none focus:border-[#0F766E]';

export function PeriodPicker({ value, onChange, custom, setCustom, today }: {
  value: string;
  onChange: (key: string) => void;
  custom: Period;
  setCustom: (p: Period) => void;
  today: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={control}>
        {PRESETS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {value === 'custom' && (
        <>
          <input type="date" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={control} />
          <span className="text-[11px] text-gray-400">to</span>
          <input type="date" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={control} />
        </>
      )}
    </div>
  );
}
