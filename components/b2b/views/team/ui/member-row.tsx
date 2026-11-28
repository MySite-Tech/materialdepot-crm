'use client';

import { useState } from 'react';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import type { B2BTeam, KylasUser, TeamMember } from '@/lib/b2b/team/types';
import { isCover, istDay, onDuty, pausedOn } from '@/lib/b2b/team/utils';
import { PauseDays, PausePatch } from './pause-days';
import { RolePatch, TeamRole, Tenure, TenurePatch } from './team-role';

const ROTATION_ON: Record<B2BTeam, string> = { inbound: 'Gets new leads', outreach: 'Gets assigned leads', kam: 'Gets new firms' };

const changedAt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function MemberRow({ member, otherTeams, hasPrimary, coverReady, pauseReady, tenureReady, busy, kylasUsers, onLoadKylasUsers, onChange, onRenumber }: {
  member: TeamMember;
  otherTeams: B2BTeam[];
  hasPrimary: boolean;
  coverReady: boolean;
  pauseReady: boolean;
  tenureReady: boolean;
  busy: boolean;
  kylasUsers: KylasUser[] | null;
  onLoadKylasUsers: () => void;
  onChange: (patch: Partial<Pick<TeamMember, 'inRotation' | 'active' | 'kylasUserId' | 'isAdmin'>> & RolePatch & PausePatch & TenurePatch) => void;
  onRenumber: (to: string) => void;
}) {
  const [linking, setLinking] = useState(false);
  const [newPhone, setNewPhone] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const digits = (newPhone ?? '').replace(/\D/g, '');
  const isInbound = member.team === 'inbound';

  return (
    <tr className={`border-t border-gray-100 ${member.active ? '' : 'opacity-50'}`}>
      <td className="px-3 py-2 text-[13px] font-medium text-gray-900">
        {member.name}
        {otherTeams.length > 0 && <span className="block text-[10.5px] font-normal text-gray-400">also on {otherTeams.map((t) => B2B_TEAM_LABEL[t]).join(', ')}</span>}
        <TeamRole member={member} hasPrimary={hasPrimary} ready={coverReady} busy={busy} onChange={onChange} />
        <Tenure member={member} ready={tenureReady} busy={busy} onChange={onChange} />
      </td>
      <td className="px-3 py-2 text-[12px] font-mono text-gray-500">
        {newPhone === null ? (
          <>
            {member.phone}
            <button disabled={busy} onClick={() => setNewPhone('')} className="ml-2 font-sans text-[11px] text-gray-400 hover:text-gray-700 underline">change</button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="New number"
              className="w-[96px] border border-gray-200 rounded px-1 py-0.5 text-[12px]" />
            <button disabled={busy || digits.length !== 10} onClick={() => { onRenumber(digits); setNewPhone(null); }}
              className="font-sans text-[11px] font-semibold text-gray-700 disabled:opacity-40">Move</button>
            <button onClick={() => setNewPhone(null)} className="font-sans text-[11px] text-gray-400">Cancel</button>
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-[12px]">
        {linking ? (
          kylasUsers ? (
            <select
              autoFocus
              className="border border-gray-200 rounded px-1.5 py-1 text-[12px] max-w-[220px]"
              defaultValue={member.kylasUserId ?? ''}
              onChange={(e) => { setLinking(false); onChange({ kylasUserId: e.target.value ? Number(e.target.value) : null }); }}
            >
              <option value="">Not linked</option>
              {kylasUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.phone ? ` · ${u.phone}` : ''}{u.active ? '' : ' (inactive)'}</option>
              ))}
            </select>
          ) : <span className="text-gray-400">Loading Kylas users…</span>
        ) : member.kylasUserId ? (
          <span className="text-gray-700">{member.kylasName || `Kylas #${member.kylasUserId}`}</span>
        ) : isInbound ? (
          <span className="text-amber-700 font-medium">Not linked — cannot own leads</span>
        ) : (
          <span className="text-gray-400">Not linked</span>
        )}
        {!linking && (
          <button
            disabled={busy}
            onClick={() => { setLinking(true); onLoadKylasUsers(); }}
            className="ml-2 text-[11px] text-gray-400 hover:text-gray-700 underline"
          >
            change
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-[12px]">
        {isInbound && member.active && !member.kylasUserId ? (
          <span className="text-amber-700">Skipped until linked</span>
        ) : (
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#EAB308]"
              disabled={busy || !member.active}
              checked={member.inRotation && member.active}
              onChange={() => onChange({ inRotation: !member.inRotation })}
            />
            {member.inRotation && member.active ? (pausedOn(member) ? 'Paused for set days' : ROTATION_ON[member.team]) : 'Paused'}
          </label>
        )}
        {member.inRotation && <PauseDays member={member} ready={pauseReady} busy={busy} onChange={onChange} />}
        {member.active && isCover(member) && !onDuty(member) && (
          <span className="block text-[10.5px] text-gray-500">Gets no new work outside the cover days</span>
        )}
        {member.updatedBy && (
          <span className="block text-[10.5px] text-gray-400" title="The last change to this row, whichever setting it was">
            changed by {member.updatedBy}{member.updatedAt ? ` · ${changedAt(member.updatedAt)}` : ''}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-[12px]">
        <label className="inline-flex items-center gap-1.5 cursor-pointer" title="Sees every rep's B2B data and can assign work. Cannot change this team list.">
          <input
            type="checkbox"
            className="accent-[#EAB308]"
            disabled={busy || !member.active}
            checked={member.isAdmin && member.active}
            onChange={() => onChange({ isAdmin: !member.isAdmin })}
          />
          {member.isAdmin && member.active ? 'B2B admin' : 'Own data'}
        </label>
      </td>
      <td className="px-3 py-2 text-right">
        {leaving !== null ? (
          <span className="inline-flex flex-col items-end gap-1 text-[11px] text-gray-500">
            Last day on {member.team === 'kam' ? 'KAM' : member.team === 'inbound' ? 'Inbound' : 'Outreach'}
            <input type="date" aria-label="Last day" value={leaving} max={istDay()} min={member.joinedOn || undefined} onChange={(e) => setLeaving(e.target.value)}
              className="border border-gray-200 rounded px-1 py-0.5 text-[12px] text-gray-800" />
            <span className="flex gap-2">
              <button onClick={() => setLeaving(null)} className="text-gray-400">Cancel</button>
              <button disabled={busy || !leaving} onClick={() => { onChange({ active: false, leftOn: leaving }); setLeaving(null); }}
                className="font-semibold text-gray-800 disabled:opacity-40">Remove</button>
            </span>
          </span>
        ) : (
          <button
            disabled={busy}
            onClick={() => (member.active
              ? tenureReady ? setLeaving(istDay()) : onChange({ active: false })
              : onChange({ active: true, ...(tenureReady && member.leftOn ? { leftOn: null } : {}) }))}
            className="text-[12px] font-medium text-gray-500 hover:text-gray-900"
          >
            {member.active ? 'Remove' : 'Restore'}
          </button>
        )}
      </td>
    </tr>
  );
}
