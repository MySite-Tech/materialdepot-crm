'use client';

import type { DateRange } from '../types';
import { datePresets, rangeLabel } from '../utils/dates';
import { Popover } from './popover';

export function DateRangeFilter({ label, value, onChange, presetDays }: {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  presetDays?: number;
}) {
  const on = !!(value[0] || value[1]);
  return (
    <Popover trigger={on ? `${label}: ${rangeLabel(value)}` : label} active={on}>
      {close => (
        <>
          {presetDays !== undefined && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {datePresets(presetDays).map(([name, a, b]) => (
                <button key={name} onClick={() => { onChange([a, b]); close(); }}
                  className="border border-gray-200 rounded-full px-2.5 py-0.5 text-[12px] hover:bg-gray-50 cursor-pointer">
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 items-center text-[12px]">
            <input type="date" aria-label={`${label} from`} value={value[0]} onChange={e => onChange([e.target.value, value[1]])} className="border border-gray-200 rounded-lg px-2 py-1" />
            <span aria-hidden>→</span>
            <input type="date" aria-label={`${label} to`} value={value[1]} onChange={e => onChange([value[0], e.target.value])} className="border border-gray-200 rounded-lg px-2 py-1" />
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 text-[12px] text-gray-500">
            <button className="cursor-pointer hover:text-gray-900" onClick={() => { onChange(['', '']); close(); }}>Clear</button>
          </div>
        </>
      )}
    </Popover>
  );
}
