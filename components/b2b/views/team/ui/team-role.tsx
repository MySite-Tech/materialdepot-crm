'use client';

import { useState } from 'react';
import type { MemberInput, TeamMember } from '@/lib/b2b/team/types';
import { CoverState, coverLabel, coverState, istDay } from '@/lib/b2b/team/utils';

export type RolePatch = Pick<MemberInput, 'primary' | 'from' | 'to'>;

const TONE: Record<CoverState, string> = {
  covering: 'bg-sky-50 text-sky-800 border-sky-200',
  upcoming: 'bg-gray-50 text-gray-600 border-gray-200',
  ended: 'bg-amber-50 text-amber-800 border-amber-200',
};

const chip = 'inline-block mt-0.5 px-1.5 py-px rounded border text-[10.5px] font-semibold';
const link = 'ml-1.5 text-[10.5px] font-normal text-gray-400 hover:text-gray-700 underline disabled:opacity-40';

export function CoverDates({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const input = 'border border-gray-200 rounded px-1 py-0.5 text-[12px] font-normal normal-case tracking-normal text-gray-800';
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <input type="date" aria-label="Cover starts" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
      <span className="text-gray-400">to</span>
      <input type="date" aria-label="Cover ends" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
    </span>
  );
}

export const coverValid = (from: string, to: string): boolean => !!to && (!from || from <= to);

export function TeamRole({ member, hasPrimary, ready, busy, onChange }: {
  member: TeamMember;
  hasPrimary: boolean;
  ready: boolean;
  busy: boolean;
  onChange: (patch: RolePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(member.from ?? istDay());
  const [to, setTo] = useState(member.to ?? '');
  if (!ready || !member.active) return null;

  if (editing) {
    return (
      <span className="flex items-center gap-1 mt-1 flex-wrap">
        <CoverDates from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button disabled={busy || !coverValid(from, to)} onClick={() => { onChange({ from: from || null, to }); setEditing(false); }}
          className="text-[11px] font-semibold text-gray-700 disabled:opacity-40">Save</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400">Cancel</button>
      </span>
    );
  }

  const state = coverState(member);
  if (member.primary) return <span className={`${chip} bg-gray-900 text-white border-gray-900`}>Primary team</span>;
  if (state) {
    return (
      <span className="block">
        <span className={`${chip} ${TONE[state]}`}>{coverLabel(member)}</span>
        <button disabled={busy} onClick={() => setEditing(true)} className={link}>dates</button>
        <button disabled={busy} onClick={() => onChange({ from: null, to: null })} className={link}>make permanent</button>
      </span>
    );
  }
  return (
    <span className="block">
      {!hasPrimary && <span className={`${chip} bg-amber-50 text-amber-800 border-amber-200`}>No primary team</span>}
      <button disabled={busy} onClick={() => onChange({ primary: true })} className={link}>make primary</button>
      <button disabled={busy} onClick={() => setEditing(true)} className={link}>make a cover</button>
    </span>
  );
}
