'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

import { FOCUS } from '../ui';

export function Popover({ trigger, active, count, children }: {
  trigger: string;
  active: boolean;
  count?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button aria-haspopup="dialog" aria-expanded={open}
        onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          setAlignRight(!!r && r.left + 260 > window.innerWidth);
          setOpen(o => !o);
        }}
        className={`max-w-[calc(100vw-1.5rem)] truncate border rounded-lg pl-3 pr-7 py-1.5 text-[12px] whitespace-nowrap relative cursor-pointer ${FOCUS} ${active ? 'border-gray-900 bg-amber-50 text-gray-900' : 'border-gray-200 bg-white text-gray-700'}`}>
        {trigger}
        {!!count && <span className="ml-1.5 bg-gray-900 text-white rounded-full px-1.5 text-[11px]">{count}</span>}
        <span aria-hidden className="absolute right-2.5 top-1.5 text-gray-400">▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label={trigger}
          className={`absolute z-30 top-full mt-1 ${alignRight ? 'right-0' : 'left-0'} bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 min-w-[240px] max-w-[calc(100vw-1.5rem)]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
