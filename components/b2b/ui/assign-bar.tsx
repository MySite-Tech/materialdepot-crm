'use client';

import { Rep } from '../models/outreach/intake';
import { useState } from 'react';

export type AssignTarget = Rep | 'round-robin';

export function AssignBar({ count, noun, reps, busy, rule, onAssign, onClear }: {
  count: number;
  noun: string;
  reps: Rep[];
  busy: boolean;
  rule: string;
  onAssign: (to: AssignTarget) => void;
  onClear: () => void;
}) {
  const [pick, setPick] = useState('round-robin');
  if (!count) return null;
  const target = (): AssignTarget => (pick === 'round-robin' ? 'round-robin' : reps.find((r) => r.name === pick) ?? 'round-robin');
  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-teal-50 border-b border-teal-100 text-[12px]">
      <span className="font-semibold text-teal-900">{count} {noun}{count === 1 ? '' : 's'} selected</span>
      <select value={pick} onChange={(e) => setPick(e.target.value)} title={rule}
        className="px-2 py-1 text-[12px] border border-teal-200 rounded-md bg-white">
        <option value="round-robin">Round robin</option>
        {reps.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
      </select>
      <button disabled={busy || !reps.length} onClick={() => onAssign(target())}
        className="px-3 py-1 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
        {busy ? 'Assigning…' : 'Assign'}
      </button>
      <button onClick={onClear} className="px-2 py-1 text-[12px] text-teal-800 hover:underline">Clear</button>
      <span className="text-[11px] text-teal-800/70 hidden md:inline">{rule}</span>
    </div>
  );
}
