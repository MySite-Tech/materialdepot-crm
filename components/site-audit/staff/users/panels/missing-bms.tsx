'use client';

import { Dispatch, SetStateAction } from 'react';

export function MissingBmsPanel({ bmMakeList, bmMakePanel, bmMakeSkip, createMissingBms, makingBms, missingBms, setBmMakePanel, setBmMakeSkip }: {
  bmMakeList: { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] | undefined; active?: boolean | undefined; }[];
  bmMakePanel: boolean;
  bmMakeSkip: Set<string>;
  createMissingBms: () => Promise<void>;
  makingBms: boolean;
  missingBms: { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] | undefined; active?: boolean | undefined; }[];
  setBmMakePanel: Dispatch<SetStateAction<boolean>>;
  setBmMakeSkip: Dispatch<SetStateAction<Set<string>>>;
}) {
  return (
    <div className="mb-3 rounded-md border-l-4 border-violet-500 bg-violet-50 px-3 py-2.5 text-[12.5px] text-violet-900">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          <b>{missingBms.length}</b> Business Manager{missingBms.length === 1 ? '' : 's'} in the CRM {missingBms.length === 1 ? 'has' : 'have'} no Site Audit account, so orders attributed to {missingBms.length === 1 ? 'them' : 'them'} can never link to a dashboard.
        </span>
        <button onClick={createMissingBms} disabled={makingBms || !bmMakeList.length} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {makingBms ? 'Creating…' : 'Create ' + bmMakeList.length + ' BM account' + (bmMakeList.length === 1 ? '' : 's')}
        </button>
        <button onClick={() => setBmMakePanel((v) => !v)} className="rounded-md border border-violet-300 bg-white px-2.5 py-1 text-[12px] font-bold text-violet-800">
          {bmMakePanel ? 'Hide list' : 'Review the list'}
        </button>
      </div>
    
      {bmMakePanel ? (
        <div className="mt-2.5 max-h-[280px] overflow-y-auto rounded-md border border-violet-200 bg-white">
          {missingBms.map((u) => {
            const off = bmMakeSkip.has(String(u.id));
            return (
              <label key={String(u.id)} className="flex items-center gap-2 border-t border-gray-100 px-3 py-1.5 text-[12.5px] first:border-t-0">
                <input
                  type="checkbox"
                  checked={!off}
                  onChange={() => setBmMakeSkip((prev) => {
                    const next = new Set(prev);
                    if (off) next.delete(String(u.id)); else next.add(String(u.id));
                    return next;
                  })}
                />
                <span className="font-semibold text-gray-800">{u.name}</span>
                <span className="text-gray-400">{u.phone}</span>
                <span className="ml-auto text-[11px] uppercase tracking-wider text-gray-400">{u.role}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
