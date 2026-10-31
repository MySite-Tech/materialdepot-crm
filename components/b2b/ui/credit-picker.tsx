'use client';

import { useState } from 'react';
import { Creditable, RevenueCredit } from '../models/credit';
import { inputCls } from '../constants/ui';

export function CreditPicker({ owner, credit, people, canEdit, actor, onChange }: {
  owner: string;
  credit: RevenueCredit | undefined;
  people: Creditable[];
  canEdit: boolean;
  actor: string;
  onChange: (c: RevenueCredit | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const chosen = people.find((p) => p.name === pick);

  const apply = () => {
    if (!chosen || !reason.trim()) return;
    onChange({ name: chosen.name, phone: chosen.phone, kylasUserId: chosen.kylasUserId ?? null, reason: reason.trim(), by: actor, at: new Date().toISOString() });
    setEditing(false); setPick(''); setReason('');
  };

  return (
    <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2 text-[11.5px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Revenue credited to</span>
        {credit ? (
          <span className="text-gray-800">
            <strong>{credit.name}</strong>
            <span className="text-gray-500"> — set by {credit.by} on {credit.at.slice(0, 10)}: {credit.reason}</span>
          </span>
        ) : (
          <span className="text-gray-800"><strong>{owner || 'No owner'}</strong> <span className="text-gray-400">(owner at close)</span></span>
        )}
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="text-[#0F766E] font-semibold hover:underline">Change</button>
        )}
        {canEdit && credit && !editing && (
          <button onClick={() => onChange(undefined)} className="text-gray-500 hover:underline">Back to owner</button>
        )}
      </div>
      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto_auto] gap-2 mt-2 items-center">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
            <option value="">Pick a person…</option>
            {people.map((p) => <option key={`${p.name}|${p.phone || ''}`} value={p.name}>{p.name}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (required)" className={inputCls} />
          <button onClick={apply} disabled={!chosen || !reason.trim()} className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white font-semibold disabled:opacity-40">Apply</button>
          <button onClick={() => setEditing(false)} className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-600">Cancel</button>
        </div>
      )}
      {!canEdit && <p className="text-[10.5px] text-gray-400 mt-1">Only a B2B manager or admin can change who is credited.</p>}
    </div>
  );
}
