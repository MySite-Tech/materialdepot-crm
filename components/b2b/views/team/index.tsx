'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchUsers } from '@/lib/api';
import { fetchKylasUsers, saveTeamMember } from '@/lib/b2b/team';
import { B2B_TEAMS } from '@/lib/b2b/team/constants';
import type { B2BTeam, B2BTeamLoad, KylasUser, TeamMember, Viewer } from '@/lib/b2b/team/types';
import { canUseB2B, rotationOrder } from '@/lib/b2b/team/utils';
import { normalisePhone } from '@/lib/org/utils';
import type { AppUser } from '@/types/crm';
import { MemberRow } from './ui/member-row';
import { RotationPanel } from './ui/rotation-panel';

export default function TeamView({ team }: { team: B2BTeamLoad; viewer: Viewer }) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [kylasUsers, setKylasUsers] = useState<KylasUser[] | null>(null);
  const [pickPhone, setPickPhone] = useState('');
  const [pickTeam, setPickTeam] = useState<B2BTeam>('inbound');
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'warn' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((e) => setUsersError(e instanceof Error ? e.message : 'Could not load CRM users'));
  }, []);

  const loadKylasUsers = () => {
    if (kylasUsers) return;
    fetchKylasUsers()
      .then((list) => setKylasUsers([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'Could not load Kylas users' }));
  };

  const memberPhones = useMemo(() => new Set(team.members.map((m) => m.phone)), [team.members]);
  const candidates = useMemo(
    () => (users ?? [])
      .filter((u) => u.active !== false && canUseB2B(u) && !memberPhones.has(normalisePhone(u.phone)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users, memberPhones],
  );
  const rotationSize = useMemo(() => rotationOrder(team.members).length, [team.members]);

  const save = (m: Pick<TeamMember, 'phone' | 'name' | 'team' | 'inRotation' | 'active'> & { kylasUserId?: number | null; isAdmin?: boolean }) => {
    setBusyPhone(m.phone);
    setNotice(null);
    saveTeamMember(m)
      .then((r) => {
        if (r.warning) setNotice({ tone: 'warn', text: r.warning });
        team.reload();
      })
      .catch((e) => setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'Save failed' }))
      .finally(() => setBusyPhone(null));
  };

  const add = () => {
    const u = candidates.find((c) => normalisePhone(c.phone) === pickPhone);
    if (!u) return;
    save({ phone: pickPhone, name: u.name, team: pickTeam, inRotation: true, active: true });
    setPickPhone('');
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div>
        <h2 className="text-[18px] font-bold text-gray-900">B2B team</h2>
        <p className="text-[12.5px] text-gray-500 mt-0.5">
          Who is on Inbound, Outreach and KAM. Each person sees their own leads and accounts. Admins, B2B managers and anyone marked B2B admin here see everyone.
          People are added from the existing CRM users. Their Kylas user is found by phone number.
        </p>
      </div>

      {team.tableMissing && (
        <p className="text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          The team tables are not set up in the CRM database yet — <code>supabase/migrations/b2b-team.sql</code> has
          to be run once. Until then nobody is on a team and Inbound Leads shows everyone&apos;s leads.
        </p>
      )}
      {team.error && <p className="text-[12.5px] text-red-600">{team.error}</p>}
      {notice && (
        <p className={`text-[12.5px] rounded px-3 py-2 border ${notice.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {notice.text}
        </p>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[240px] flex-1">
          Add a person
          <select
            value={pickPhone}
            onChange={(e) => setPickPhone(e.target.value)}
            disabled={!users || team.tableMissing}
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-gray-800"
          >
            <option value="">{users ? `${candidates.length} CRM users with B2B access` : usersError ? 'Could not load CRM users' : 'Loading CRM users…'}</option>
            {candidates.map((u) => (
              <option key={u.id} value={normalisePhone(u.phone)}>{u.name} · {u.role}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Team
          <select
            value={pickTeam}
            onChange={(e) => setPickTeam(e.target.value as B2BTeam)}
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-gray-800"
          >
            {B2B_TEAMS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <button
          disabled={!pickPhone || !!busyPhone}
          onClick={add}
          className="px-4 py-1.5 text-[13px] font-semibold rounded bg-[#EAB308] text-[#1A1A1A] disabled:opacity-40"
        >
          Add
        </button>
        {usersError && <p className="basis-full text-[12px] text-red-600">{usersError}</p>}
      </section>

      <RotationPanel rotationSize={rotationSize} />

      {B2B_TEAMS.map((t) => {
        const rows = team.members.filter((m) => m.team === t.key);
        return (
          <section key={t.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-gray-900">{t.label}</h3>
              <span className="text-[12px] text-gray-400">{rows.filter((m) => m.active).length} active</span>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-3 text-[12.5px] text-gray-400">
                {team.loading ? 'Loading…' : `Nobody on ${t.label} yet.`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left table-fixed min-w-[760px]">
                  <thead className="text-[10.5px] uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="w-[20%] px-3 py-2 font-semibold">Name</th>
                      <th className="w-[14%] px-3 py-2 font-semibold">Phone</th>
                      <th className="w-[26%] px-3 py-2 font-semibold">Kylas user</th>
                      <th className="w-[16%] px-3 py-2 font-semibold">Round robin</th>
                      <th className="w-[14%] px-3 py-2 font-semibold">Access</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <MemberRow
                        key={m.phone}
                        member={m}
                        busy={busyPhone === m.phone}
                        kylasUsers={kylasUsers}
                        onLoadKylasUsers={loadKylasUsers}
                        onChange={(patch) => save({ ...m, ...patch })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
