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

export type TenurePatch = Pick<MemberInput, 'joinedOn' | 'leftOn' | 'active'>;

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function tenureLabel(m: Pick<TeamMember, 'joinedOn' | 'leftOn'>): string | null {
  if (m.joinedOn && m.leftOn) return `On the team ${day(m.joinedOn)} – ${day(m.leftOn)}`;
  if (m.leftOn) return `Last day ${day(m.leftOn)}`;
  if (m.joinedOn) return `On the team since ${day(m.joinedOn)}`;
  return null;
}

export function Tenure({ member, ready, busy, onChange }: {
  member: TeamMember;
  ready: boolean;
  busy: boolean;
  onChange: (patch: TenurePatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [joined, setJoined] = useState(member.joinedOn ?? '');
  const [left, setLeft] = useState(member.leftOn ?? '');
  if (!ready) return null;
  const input = 'border border-gray-200 rounded px-1 py-0.5 text-[12px] text-gray-800';

  if (editing) {
    return (
      <span className="flex items-center gap-1 mt-1 flex-wrap text-[11px] text-gray-500">
        <input type="date" aria-label="First day on the team" value={joined} onChange={(e) => setJoined(e.target.value)} className={input} />
        to
        <input type="date" aria-label="Last day on the team" value={left} min={joined || undefined} onChange={(e) => setLeft(e.target.value)} className={input} />
        <button
          disabled={busy || (!!joined && !!left && left < joined)}
          onClick={() => { onChange({ joinedOn: joined || null, leftOn: left || null, ...(left && left < istDay() ? { active: false } : {}) }); setEditing(false); }}
          className="font-semibold text-gray-700 disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400">Cancel</button>
      </span>
    );
  }

  const label = tenureLabel(member);
  return (
    <span className="block">
      {label && <span className={`${chip} bg-gray-50 text-gray-600 border-gray-200`}>{label}</span>}
      <button
        disabled={busy} onClick={() => setEditing(true)} className={label ? link : `-ml-1.5 ${link}`}
        title="Revenue counts under this team only for orders placed between these days"
      >
        {label ? 'change dates' : 'set team dates'}
      </button>
    </span>
  );
}
