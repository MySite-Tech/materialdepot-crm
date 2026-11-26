'use client';

import { useState } from 'react';
import type { MemberInput, TeamMember } from '@/lib/b2b/team/types';
import { istDay, pauseLabel, pausedOn } from '@/lib/b2b/team/utils';
import { CoverDates } from './team-role';

export type PausePatch = Pick<MemberInput, 'pausedFrom' | 'pausedTo'>;

const link = 'ml-1.5 text-[10.5px] font-normal text-gray-400 hover:text-gray-700 underline disabled:opacity-40';

export function PauseDays({ member, ready, busy, onChange }: {
  member: TeamMember;
  ready: boolean;
  busy: boolean;
  onChange: (patch: PausePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(member.pausedFrom ?? istDay());
  const [to, setTo] = useState(member.pausedTo ?? istDay());
  if (!ready || !member.active) return null;

  if (editing) {
    return (
      <span className="flex items-center gap-1 mt-1 flex-wrap">
        <CoverDates from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button disabled={busy || !from || !to || to < from} onClick={() => { onChange({ pausedFrom: from, pausedTo: to }); setEditing(false); }}
          className="text-[11px] font-semibold text-gray-700 disabled:opacity-40">Save</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400">Cancel</button>
      </span>
    );
  }

  const label = pauseLabel(member);
  if (!label) {
    return <button disabled={busy} onClick={() => setEditing(true)} className={`block -ml-1.5 ${link}`}>pause for days</button>;
  }
  const now = pausedOn(member);
  return (
    <span className="block mt-0.5">
      <span className={`inline-block px-1.5 py-px rounded border text-[10.5px] font-semibold ${now ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{label}</span>
      <button disabled={busy} onClick={() => setEditing(true)} className={link}>dates</button>
      <button disabled={busy} onClick={() => onChange({ pausedFrom: null, pausedTo: null })} className={link}>clear</button>
    </span>
  );
}
