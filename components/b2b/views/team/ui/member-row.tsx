'use client';

import { useState } from 'react';
import type { KylasUser, TeamMember } from '@/lib/b2b/team/types';

export function MemberRow({ member, busy, kylasUsers, onLoadKylasUsers, onChange }: {
  member: TeamMember;
  busy: boolean;
  kylasUsers: KylasUser[] | null;
  onLoadKylasUsers: () => void;
  onChange: (patch: Partial<Pick<TeamMember, 'inRotation' | 'active' | 'kylasUserId' | 'isAdmin'>>) => void;
}) {
  const [linking, setLinking] = useState(false);
  const isInbound = member.team === 'inbound';

  return (
    <tr className={`border-t border-gray-100 ${member.active ? '' : 'opacity-50'}`}>
      <td className="px-3 py-2 text-[13px] font-medium text-gray-900">{member.name}</td>
      <td className="px-3 py-2 text-[12px] font-mono text-gray-500">{member.phone}</td>
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
        ) : isInbound ? (
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#EAB308]"
              disabled={busy || !member.active}
              checked={member.inRotation && member.active}
              onChange={() => onChange({ inRotation: !member.inRotation })}
            />
            {member.inRotation && member.active ? 'Gets new leads' : 'Paused'}
          </label>
        ) : <span className="text-gray-300">—</span>}
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
        <button
          disabled={busy}
          onClick={() => onChange({ active: !member.active })}
          className="text-[12px] font-medium text-gray-500 hover:text-gray-900"
        >
          {member.active ? 'Remove' : 'Restore'}
        </button>
      </td>
    </tr>
  );
}
