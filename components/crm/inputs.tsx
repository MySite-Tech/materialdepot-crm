'use client';

import { DateRangePickerProps, MultiSelectProps } from './types/crm';
import { fmtDate } from './utils/crm';
import { useEffect, useRef, useState } from 'react';
import { DateRange, DayPicker } from 'react-day-picker';

export function MultiSelect({ options, selected, onChange, label, className = '', searchable = false }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
    if (!open) setSearch('');
  }, [open, searchable]);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const display = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  const filtered = searchable && search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        className="px-2 py-1.5 text-[12px] w-full min-w-[100px] border border-gray-200 rounded-md outline-none font-sans cursor-pointer flex items-center gap-1 bg-white text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-[12px] truncate">{display}</span>
        <span className="text-[10px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-[999] bg-white border border-gray-200 rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.1)] w-full min-w-[220px] mt-0.5">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-yellow-400"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="max-h-[220px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-gray-400">No results</div>
            ) : filtered.map((opt, i) => (
              <label
                key={`${opt}-${i}`}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer text-[13px] whitespace-nowrap hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-[#EAB308]"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DateRangePicker({ dateFrom, dateTo, onChange, label: pickerLabel, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasRange = dateFrom || dateTo;
  const displayLabel = pickerLabel || 'Date Range';
  const display = !hasRange
    ? displayLabel
    : dateFrom && dateTo
      ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
      : dateFrom
        ? `From ${fmtDate(dateFrom)}`
        : `Until ${fmtDate(dateTo)}`;

  const toDateObj = (s: string): Date | undefined => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const selected: DateRange | undefined = (dateFrom || dateTo) ? { from: toDateObj(dateFrom), to: toDateObj(dateTo) } : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) { onChange('', ''); return; }
    onChange(toStr(range.from), toStr(range.to));
  };

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none font-sans w-full min-w-[110px] cursor-pointer flex items-center gap-1 bg-white text-left whitespace-nowrap"
        onClick={() => setOpen(!open)}
      >
        <span className={`flex-1 text-xs ${hasRange ? 'text-gray-700' : 'text-gray-400'}`}>{display}</span>
        <span className="text-[10px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-[100] bg-white border border-gray-200 rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.1)] mt-0.5 p-3">
          <DayPicker
            className="rdp-compact"
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={{ before: new Date(2026, 3, 1) }}
            defaultMonth={new Date(2026, 3, 1)}
          />
          {hasRange && (
            <div className="mt-2">
              <button
                className="bg-white text-gray-700 border border-gray-200 w-full py-1.5 px-2.5 rounded-md text-[11px] font-medium cursor-pointer"
                onClick={() => { onChange('', ''); setOpen(false); }}
              >Clear Dates</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
