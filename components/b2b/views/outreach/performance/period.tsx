'use client';

import { Period } from '../../../models/outreach/kpis';
import { RANGE_LABEL } from '../constants';
import { RangeKey } from '../types';
import { monthLabel, shiftMonth } from '../utils';

const control = 'px-2 py-1 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-700 outline-none focus:border-[#0F766E]';

export function periodOptions(today: string): { key: string; label: string }[] {
  const month = today.slice(0, 7);
  const ranges: RangeKey[] = ['week', 'last7', 'last30', 'custom'];
  return [
    { key: 'month', label: `This month · ${monthLabel(month)}` },
    { key: 'last-month', label: `Last month · ${monthLabel(shiftMonth(month, -1))}` },
    ...[2, 3, 4, 5].map((n) => ({ key: `m:${shiftMonth(month, -n)}`, label: monthLabel(shiftMonth(month, -n)) })),
    ...ranges.map((r) => ({ key: r, label: RANGE_LABEL[r] })),
  ];
}

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
        {periodOptions(today).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
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
