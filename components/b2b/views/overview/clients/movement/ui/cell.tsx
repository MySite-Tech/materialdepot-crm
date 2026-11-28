'use client';

import type { ReactNode } from 'react';

export function Cell({ count, value, sub, active, onPick }: {
  count: number | null;
  value: string;
  sub?: ReactNode;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!count}
      aria-pressed={active}
      className={`w-full text-right rounded-md px-2 py-1.5 cursor-pointer disabled:cursor-default ${active ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-50 disabled:hover:bg-transparent'}`}
    >
      <div className={`tabular-nums text-[14px] font-bold ${count ? 'text-gray-900' : 'text-gray-300'}`}>{count === null ? 'Unknown' : count || '—'}</div>
      {!!count && <div className="tabular-nums text-[10px] text-gray-400">{value}</div>}
      {!!count && sub && <div className="tabular-nums text-[10px] mt-0.5">{sub}</div>}
    </button>
  );
}
