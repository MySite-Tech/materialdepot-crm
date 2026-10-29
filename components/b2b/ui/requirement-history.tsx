'use client';

import { useState } from 'react';
import { RequirementVersion } from '../models/requirement';

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
};

export function RequirementHistory({ history }: { history?: RequirementVersion[] }) {
  const [open, setOpen] = useState(false);
  if (!history?.length) return null;
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[10.5px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer">
        {open ? '▾' : '▸'} Previous requirements ({history.length})
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-2 border-l-2 border-gray-100 pl-3">
          {[...history].reverse().map((v, i) => (
            <li key={`${v.replacedAt}-${i}`} className="text-[11px] text-gray-600">
              <div className="whitespace-pre-wrap break-words">{v.text}</div>
              <div className="text-[10px] text-gray-400">
                Replaced {fmtWhen(v.replacedAt)}{v.replacedBy ? ` by ${v.replacedBy}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
