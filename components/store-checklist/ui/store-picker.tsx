'use client';

import { STORES } from '@/lib/store-display/display-supabase';

export function StorePicker({ codes, value, onChange, label }: {
  codes: readonly string[];
  value: string | null;
  onChange: (code: string) => void;
  label: string;
}) {
  const options = STORES.filter((s) => codes.includes(s.code));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <select
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md bg-white outline-none min-w-[170px] cursor-pointer"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select a store…</option>
        {options.map((s) => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}

export function DatePicker({ value, min, max, onChange, label }: {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md bg-white outline-none cursor-pointer"
      />
    </label>
  );
}
