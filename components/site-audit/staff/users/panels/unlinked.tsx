'use client';

import { fmtDate } from '../../../shared/format';
import { ProfileRow } from '../types';
import { RoleBadge } from '../ui';
import { Dispatch, SetStateAction } from 'react';

export function UnlinkedPanel({ backfillCrmLogins, backfilling, createOneCrmLogin, crmBackfillPanel, linkAllSuggested, noCrm, noCrmList, setCrmBackfillPanel, suggestable, unlinked }: {
  backfillCrmLogins: () => Promise<void>;
  backfilling: boolean;
  createOneCrmLogin: (u: ProfileRow) => Promise<void>;
  crmBackfillPanel: boolean;
  linkAllSuggested: () => Promise<void>;
  noCrm: number;
  noCrmList: ProfileRow[];
  setCrmBackfillPanel: Dispatch<SetStateAction<boolean>>;
  suggestable: { p: ProfileRow; ph: string; }[];
  unlinked: number;
}) {
  return (
    <div className="mb-3 rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
      {unlinked ? <><b>{unlinked}</b> {unlinked === 1 ? 'person has' : 'people have'} no phone number — they can&apos;t be matched with a CRM login (availability, payouts, their own dashboard and BM attribution all key off it). </> : null}
      {noCrm ? <><b>{noCrm}</b> {noCrm === 1 ? 'has' : 'have'} a phone but <b>no CRM login</b>, so <code>/login-otp/</code> has no account to send an OTP to and they cannot sign in here at all. </> : null}
      Set a number on a person with Edit below.
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {suggestable.length ? (
          <button onClick={linkAllSuggested} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white">
            Link {suggestable.length} exact name match{suggestable.length === 1 ? '' : 'es'}
          </button>
        ) : null}
    
        {noCrm ? (
          <>
            <button onClick={backfillCrmLogins} disabled={backfilling} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
              {backfilling ? 'Creating…' : 'Create ' + noCrm + ' missing CRM login' + (noCrm === 1 ? '' : 's')}
            </button>
            <button onClick={() => setCrmBackfillPanel((v) => !v)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-bold text-amber-800">
              {crmBackfillPanel ? 'Hide who' : 'See who (' + noCrm + ')'}
            </button>
          </>
        ) : null}
      </div>
      {crmBackfillPanel && noCrm ? (
        <div className="mt-2.5 max-h-[280px] overflow-y-auto rounded-md border border-amber-200 bg-white">
          <table className="w-full">
            <thead><tr>{['Name', 'Phone', 'Role', 'City', 'Added', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
            ))}</tr></thead>
            <tbody>
              {noCrmList.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{u.name}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-gray-600">{u.contact}</td>
                  <td className="px-3 py-2 text-[12.5px]"><RoleBadge role={u.role} /></td>
                  <td className="px-3 py-2 text-[12.5px] text-gray-500">{u.city || 'Bengaluru'}</td>
                  <td className="px-3 py-2 text-[12px] text-gray-400">{fmtDate(u.created_at)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => createOneCrmLogin(u)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-bold text-[#1F3A5F]">Create login</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
