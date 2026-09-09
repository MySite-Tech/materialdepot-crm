'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

export const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const exportRowsCsv = (headers: string[], rows: (string | number)[][], filename: string) => {
  const all = [headers, ...rows];
  const csv = '﻿' + all.map((r) => r.map(csvEscape).join(',')).join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename + '.csv');
};

export const exportRowsExcel = async (headers: string[], rows: (string | number)[][], filename: string, sheet = 'Sheet1') => {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename + '.xlsx');
};

export const todayStr = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export type ExportFormat = 'csv' | 'excel';
export type ExportScope = 'filtered' | 'all';

const DRAG_SCROLL_EDGE = 60;
const DRAG_SCROLL_SPEED = 16;

export function useDragAutoScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef<number | null>(null);

  const stop = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const onDragOver = (e: DragEvent) => {
    const el = ref.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    const dx = e.clientX - left < DRAG_SCROLL_EDGE ? -DRAG_SCROLL_SPEED
      : right - e.clientX < DRAG_SCROLL_EDGE ? DRAG_SCROLL_SPEED
      : 0;
    stop();
    if (dx !== 0) {
      const tick = () => { el.scrollLeft += dx; frame.current = requestAnimationFrame(tick); };
      frame.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => stop, []);

  return { ref, onDragOver, onDragEnd: stop, onDrop: stop };
}

export function ExportButton({
  onExport, disabled,
}: {
  onExport: (format: ExportFormat, scope: ExportScope) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>('filtered');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const run = (format: ExportFormat) => { onExport(format, scope); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-60 hover:border-[#0F766E] hover:text-[#0F766E]"
      >
        {disabled ? (
          <>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
            Exporting…
          </>
        ) : '⇩ Export'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-md shadow-lg z-[1100] p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1">Scope</div>
          <div className="flex rounded-md border border-gray-200 overflow-hidden mb-2">
            {(['filtered', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 px-2 py-1 text-[11px] font-semibold ${scope === s ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500'}`}
              >
                {s === 'filtered' ? 'Current filter' : 'All data'}
              </button>
            ))}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1">Format</div>
          <button onClick={() => run('csv')} className="w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-gray-50 text-gray-700">CSV (.csv)</button>
          <button onClick={() => run('excel')} className="w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-gray-50 text-gray-700">Excel (.xlsx)</button>
        </div>
      )}
    </div>
  );
}

// Lost-reason picker. Any value already stored that isn't one of the options is
// kept as an extra option rather than silently reset to blank — these boards
// used a free-text box until now, so historical reasons must survive an edit.
export function LostReasonSelect({ value, options, onChange, className }: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const legacy = value && !options.includes(value) ? value : null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Select a reason…</option>
      {options.map((r) => <option key={r} value={r}>{r}</option>)}
      {legacy && <option value={legacy}>{legacy} (previously recorded)</option>}
    </select>
  );
}
