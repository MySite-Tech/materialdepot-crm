'use client';

import { useState } from 'react';
import { B2B_TEAM_LABEL, B2B_TEAMS } from '@/lib/b2b/team/constants';
import type { B2BTeam, SignInGaps, TeamMember } from '@/lib/b2b/team/types';
import { isPlaceholderName } from '@/lib/b2b/team/utils';
import { normalisePhone } from '@/lib/org/utils';

export function SignInCheck({ gaps, members, busy, onAdd, onRenumber }: {
  gaps: SignInGaps;
  members: TeamMember[];
  busy: boolean;
  onAdd: (user: { name: string; phone: string }, team: B2BTeam) => void;
  onRenumber: (member: TeamMember, to: string) => void;
}) {
  const [sameAs, setSameAs] = useState<Record<string, string>>({});
  const active = members.filter((m) => m.active);
  const people = [...new Map(active.map((m) => [m.phone, m])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const clean = !gaps.unteamed.length && !gaps.noLogin.length && !gaps.placeholder.length;

  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h3 className="text-[14px] font-semibold text-gray-900">Sign-in check</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">
          Each person is matched to their work by the number they sign in with. A number that is not on a team, or a team row on a number nobody signs in with, leaves that person&apos;s tabs empty with no error.
        </p>
      </div>
      {clean ? (
        <p className="px-4 py-3 text-[12.5px] text-gray-500">Every B2B login is on a team, and every team number has a CRM login.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-[12.5px]">
          {gaps.unteamed.map(({ user, suggest }) => {
            const phone = normalisePhone(user.phone);
            const pick = sameAs[phone] ?? '';
            const target = people.find((m) => m.phone === pick);
            const unnamed = isPlaceholderName(user.name);
            return (
              <li key={`u-${phone}`} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-[260px] flex-1">
                  <span className="font-medium text-gray-900">{user.name || 'No name'}</span>
                  <span className="text-gray-400"> · {user.role} · {phone}</span>
                  <span className="block text-gray-500">Can open B2B Sales but is on no team, so their tabs stay empty and nobody can assign them work.</span>
                </span>
                {B2B_TEAMS.map((t) => (
                  <button key={t.key} disabled={busy || unnamed} title={unnamed ? 'Django has no real name for this login. If it is a team member, use same person as.' : undefined}
                    onClick={() => onAdd({ name: user.name, phone }, t.key)}
                    className={`px-2.5 py-1 rounded border text-[12px] disabled:opacity-40 ${suggest === t.key ? 'border-[#EAB308] bg-[#FEF9C3] text-gray-900 font-semibold' : 'border-gray-200 text-gray-600'}`}>
                    Add to {t.label}
                  </button>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <select value={pick} onChange={(e) => setSameAs((s) => ({ ...s, [phone]: e.target.value }))}
                    className="border border-gray-200 rounded px-1.5 py-1 text-[12px] max-w-[200px]">
                    <option value="">or: same person as…</option>
                    {people.map((m) => <option key={m.phone} value={m.phone}>{m.name} · {m.phone}</option>)}
                  </select>
                  {target && (
                    <button disabled={busy} onClick={() => onRenumber(target, phone)}
                      className="px-2.5 py-1 rounded bg-[#1A1A1A] text-white text-[12px] disabled:opacity-40">
                      Move {target.name} to this number
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {gaps.noLogin.map((m) => (
            <li key={`n-${m.phone}-${m.team}`} className="px-4 py-2.5">
              <span className="font-medium text-gray-900">{m.name}</span>
              <span className="text-gray-400"> · {B2B_TEAM_LABEL[m.team]} · {m.phone}</span>
              <span className="block text-gray-500">No active CRM login uses this number, so nobody signs in as this row. If they sign in on another number, use &quot;same person as&quot; on that login above, or change the number in the row below.</span>
            </li>
          ))}
          {gaps.placeholder.map((u) => (
            <li key={`p-${u.id}`} className="px-4 py-2.5">
              <span className="font-medium text-gray-900">&quot;{u.name}&quot;</span>
              <span className="text-gray-400"> · {u.role} · {normalisePhone(u.phone)}</span>
              <span className="block text-gray-500">Django has no real name for this login, so the CRM header shows &quot;{u.name}&quot;. The tech team renames it in Django.</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
