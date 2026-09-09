'use client';

import { BmResolvePlan } from '../../data/resolveBmFromBackend';
import { ROLES } from '../../shared/roles';
import { ProfileRow } from '../../types/staff-users';
import { BmSearchSelect } from './ui';
import { Dispatch, SetStateAction } from 'react';

export function BmLinkPanel({ bmLink, bmPanel, bmProfiles, createResolvedOwners, linkBmOrders, linkOneBmName, linkingBm, makingOwners, resolveFromBackend, resolvePlan, resolving, setBmPanel }: {
  bmLink: { unlinkedOrders: number; plan: { raw: string; email: string; name: string; count: number; }[]; names: { raw: string; count: number; auto: string | null; candidates: { name: string; contact: string; role: string; exact: boolean; }[]; }[]; linkable: number; };
  bmPanel: boolean;
  bmProfiles: ProfileRow[];
  createResolvedOwners: () => Promise<void>;
  linkBmOrders: () => Promise<void>;
  linkOneBmName: (raw: string, email: string) => Promise<void>;
  linkingBm: boolean;
  makingOwners: boolean;
  resolveFromBackend: () => Promise<void>;
  resolvePlan: BmResolvePlan | null;
  resolving: boolean;
  setBmPanel: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="mb-3 rounded-md border-l-4 border-sky-500 bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          <b>{bmLink.unlinkedOrders}</b> audit order{bmLink.unlinkedOrders === 1 ? '' : 's'} {bmLink.unlinkedOrders === 1 ? 'is' : 'are'} not linked to a BM account, so {bmLink.unlinkedOrders === 1 ? 'it' : 'they'} only reach a BM dashboard by name match.
        </span>
        <button onClick={resolveFromBackend} disabled={resolving} className="rounded-md bg-[#0F766E] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {resolving ? 'Resolving…' : 'Resolve owners from the backend'}
        </button>
        {bmProfiles.length && bmLink.linkable ? (
          <button onClick={linkBmOrders} disabled={linkingBm} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
            {linkingBm ? 'Linking…' : 'Link ' + bmLink.linkable + ' by exact match'}
          </button>
        ) : null}
        {bmProfiles.length ? (
          <button onClick={() => setBmPanel((v) => !v)} className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[12px] font-bold text-sky-800">
            {bmPanel ? 'Hide names' : 'Link by hand (' + bmLink.names.length + ' name' + (bmLink.names.length === 1 ? '' : 's') + ')'}
          </button>
        ) : <span>Add the Business Managers as users (role: Business Manager) to link them.</span>}
      </div>
      {resolvePlan && (resolvePlan.needAccount.length || resolvePlan.unresolved) ? (
        <div className="mt-2.5 rounded-md border border-sky-200 bg-white px-3 py-2 text-[12px] text-gray-600">
          {resolvePlan.needAccount.length ? (
            <div>
              <b>{resolvePlan.needAccount.reduce((n, o) => n + o.rows, 0)}</b> order(s) belong to{' '}
              <b>{resolvePlan.needAccount.length}</b> owner(s) with no Site Audit account:{' '}
              {resolvePlan.needAccount.slice(0, 8).map((o) => o.name + (o.contact ? ' · ' + o.contact : '') + ' (' + o.rows + ')').join(', ')}
              {resolvePlan.needAccount.length > 8 ? ' …' : ''}.
              <button
                onClick={createResolvedOwners}
                disabled={makingOwners || resolving}
                className="ml-2 rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {makingOwners ? 'Creating…' : 'Create ' + resolvePlan.needAccount.length + ' account' + (resolvePlan.needAccount.length === 1 ? '' : 's') + ' and link'}
              </button>
            </div>
          ) : null}
          {resolvePlan.unresolved ? <div className="mt-1">{resolvePlan.unresolved} order(s) carry no enquiry id the backend knows — link those by hand below.</div> : null}
          {resolvePlan.truncated ? <div className="mt-1 text-amber-700">The backend list was read up to its page cap, so older jobs may not be covered.</div> : null}
        </div>
      ) : null}
      {bmPanel ? (
        <div className="mt-2.5 max-h-[320px] overflow-y-auto rounded-md border border-sky-200 bg-white">
          <table className="w-full">
            <thead>
              <tr>{['BM name on the order', 'Orders', 'Likely person · contact', 'Link to Business Manager'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {bmLink.names.map((n) => (
                <tr key={n.raw} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{n.raw}</td>
                  <td className="px-3 py-2 text-[12.5px] text-gray-500">{n.count}</td>
                  <td className="px-3 py-2 text-[12.5px] whitespace-nowrap">
                    {n.candidates.length ? (
                      n.candidates.map((c) => (
                        <div key={c.contact} className={c.exact ? 'text-gray-800' : 'text-gray-500'}>
                          <a href={'tel:' + c.contact} className="font-semibold underline decoration-gray-300">{c.contact}</a>
                          {c.name && c.name.trim().toLowerCase() !== n.raw.trim().toLowerCase()
                            ? <span className="ml-1.5 text-gray-400">{c.name}</span> : null}
                          {c.role && c.role !== 'bm'
                            ? <span className="ml-1 text-[11px] text-amber-700">{ROLES[c.role]?.label || c.role}</span> : null}
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-400">no matching person</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <BmSearchSelect
                        options={bmProfiles.map((p) => ({ id: p.id, name: p.name, email: p.email, contact: p.contact }))}
                        disabled={linkingBm}
                        suggested={n.auto ? (bmProfiles.find((p) => p.email === n.auto)?.name || null) : null}
                        onPick={(email) => linkOneBmName(n.raw, email)}
                      />
                      {n.auto ? <span className="shrink-0 text-[11px] font-bold text-green-700">exact match</span> : null}
                    </div>
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
