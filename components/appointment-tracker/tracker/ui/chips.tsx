'use client';

import { CHIP_DOTS, PRESET_LABELS } from '../constants';
import { DatePreset, DateRange } from '../../types/appointments';
import { rangeForPreset } from '../utils';

export function SelectChip<T extends string>({ dot, value, onChange, options, title }: {
  dot: keyof typeof CHIP_DOTS;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  title: string;
}) {
  return (
    <div className="relative inline-flex">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ background: CHIP_DOTS[dot] }}
      />
      <select
        value={value}
        title={title}
        aria-label={title}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-full border border-gray-300 bg-white pl-7 pr-7 py-1.5 text-[12px] font-semibold text-gray-700 leading-[16px] cursor-pointer outline-none hover:border-gray-400 hover:text-gray-800 focus:border-yellow-400 transition-all"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">▾</span>
    </div>
  );
}

export function DateRangeControl({ value, onChange }: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const setPreset = (p: DatePreset) => {
    if (p === "custom") { onChange({ ...value, preset: p }); return; }
    const [f, t] = rangeForPreset(p);
    onChange({ preset: p, from: f, to: t });
  };
  return (
    <>
      <SelectChip<DatePreset>
        dot="date"
        title="Date range"
        value={value.preset}
        onChange={setPreset}
        options={(Object.keys(PRESET_LABELS) as DatePreset[]).map((k) => ({ value: k, label: PRESET_LABELS[k] }))}
      />
      {value.preset === "custom" && (
        <div className="inline-flex items-center gap-1.5">
          <input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 cursor-pointer" />
          <span className="text-[11px] text-gray-400">–</span>
          <input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[12px] text-gray-700 outline-none focus:border-yellow-400 cursor-pointer" />
        </div>
      )}
    </>
  );
}
