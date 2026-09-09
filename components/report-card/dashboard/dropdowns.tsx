'use client';

import { useState } from 'react';

export function Dropdown({
  value, placeholder, options, onChange, searchable,
}: {
  value: string; placeholder: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = options.find(o => o.value === value);
  const visible = searchable && q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
      >
        <span className={sel ? '' : 'text-gray-400'}>{sel ? sel.label : placeholder}</span>
        <span className="text-[10px] text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
            {searchable && (
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] outline-none" />
              </div>
            )}
            {visible.map(o => (
              <button key={o.value || '_all'} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer ${o.value === value ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'}`}>
                {o.label}
              </button>
            ))}
            {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
          </div>
        </>
      )}
    </div>
  );
}

export function MultiDropdown({
  values, placeholder, options, onChange, searchable,
}: {
  values: string[]; placeholder: string; options: { label: string; value: string }[];
  onChange: (v: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const visible = searchable && q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  const label = values.length === 0
    ? placeholder
    : values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? values[0])
      : `${values.length} selected`;
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
      >
        <span className={values.length ? '' : 'text-gray-400'}>{label}</span>
        <span className="text-[10px] text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[180px] max-h-[260px] overflow-y-auto flex flex-col">
            {searchable && (
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] outline-none" />
              </div>
            )}
            {values.length > 0 && (
              <button onClick={() => onChange([])}
                className="text-left px-3 py-1.5 text-[12px] text-gray-500 hover:bg-gray-50 border-b border-gray-100 cursor-pointer">
                Clear all
              </button>
            )}
            {visible.map(o => {
              const checked = values.includes(o.value);
              return (
                <button key={o.value || '_all'} onClick={() => toggle(o.value)}
                  className={`flex items-center gap-2 text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer ${checked ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'}`}>
                  <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border text-[9px] leading-none ${checked ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                  {o.label}
                </button>
              );
            })}
            {visible.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>}
          </div>
        </>
      )}
    </div>
  );
}
