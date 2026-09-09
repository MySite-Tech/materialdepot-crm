'use client';

import { useEffect, useRef, useState } from 'react';
import { ExportFormat, ExportScope } from '../types/export';

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
