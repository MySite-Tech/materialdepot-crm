'use client';

import { fmtDate, initials } from '../../shared/format';
import { phoneKey } from '../../shared/identity';
import { ROLES } from '../../shared/roles';
import { ProfileRow } from '../../types/staff-users';
import { isInstallerRole } from '../../utils/staff-users';
import { INSTALLER_TYPES, RetireTarget } from '../StaffModals';
import { RoleBadge } from './ui';
import { Dispatch, SetStateAction } from 'react';

export function StaffTable({ canRetire, createOneCrmLogin, crmPhones, err, filtered, loading, setEditing, setRestoring, showingFormer, startRemove, suggestFor }: {
  canRetire: boolean;
  createOneCrmLogin: (u: ProfileRow) => Promise<void>;
  crmPhones: Set<string>;
  err: string;
  filtered: ProfileRow[];
  loading: boolean;
  setEditing: Dispatch<SetStateAction<ProfileRow | null>>;
  setRestoring: Dispatch<SetStateAction<(RetireTarget & { exitReason?: string | null | undefined; }) | null>>;
  showingFormer: boolean;
  startRemove: (u: ProfileRow) => void;
  suggestFor: (p: ProfileRow) => string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      {loading ? (
        <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
      ) : err ? (
        <div className="px-4 py-6 text-[13px] text-red-600">{err}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>{(showingFormer
              ? ['Name', 'Email', 'Phone', 'Role', 'City', 'Left on', 'Reason', 'Removed by', '']
              : ['Name', 'Email', 'Phone', 'Role', 'City', 'Added', '']
            ).map((h, i) => (
              <th key={h + i} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((u) => {
              const key = phoneKey(u.contact);
              return (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[13px]">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: ROLES[u.role]?.color || '#999' }}>{initials(u.name)}</span>
                      <b>{u.name}</b>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-gray-500">{u.email}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {key
                      ? (crmPhones.has(key) || showingFormer
                        ? <span className="text-gray-600" title={showingFormer ? 'Former staff' : 'Linked to a CRM login'}>{u.contact}</span>
                        : (
                          <span className="text-amber-700" title="No usable CRM login for this number — they cannot be sent an OTP, so they cannot sign in here">
                            {u.contact} ⚠
                            <button onClick={() => createOneCrmLogin(u)} className="ml-1.5 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">Fix</button>
                          </span>
                        ))
                      : (() => {
                        const sg = suggestFor(u);
                        return sg
                          ? <span className="text-amber-700" title={'Matches a CRM login with the same name'}>not set · suggest {sg}</span>
                          : <span className="text-red-600">not set</span>;
                      })()}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">
                    <RoleBadge role={u.role} />
                    {isInstallerRole(u.role) ? <span className="ml-1.5 text-[11px] text-gray-400">{INSTALLER_TYPES.find(([k]) => k === (u.installer_type || 'flooring'))?.[1]}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{u.city || 'Bengaluru'}</td>
                  {showingFormer ? (
                    <>
                      <td className="px-3 py-2.5 text-[12px] text-gray-500">{fmtDate(u.deleted_at)}</td>
                      <td className="px-3 py-2.5 text-[12.5px] text-gray-700">{u.exit_reason || '—'}</td>
                      <td className="px-3 py-2.5 text-[11.5px] text-gray-400">{u.deleted_by || '—'}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => setRestoring({ id: u.id, name: u.name, email: u.email, role: u.role, contact: u.contact, city: u.city, exitReason: u.exit_reason })}
                          className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1f7a3f]"
                        >
                          Bring back
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-[12px] text-gray-400">{fmtDate(u.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditing(u)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700">✏️ Edit</button>
    
                          <button
                            onClick={() => startRemove(u)}
                            disabled={!canRetire}
                            title={canRetire ? 'Mark as no longer staff' : 'Needs site-audit-migration-004-staff-exit.sql to be run first'}
                            className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            }) : (
              <tr><td colSpan={showingFormer ? 9 : 7} className="border-t border-gray-100 py-10 text-center text-[13px] text-gray-400">
                {showingFormer ? 'Nobody has been removed yet.' : 'No users match your search'}
              </td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
