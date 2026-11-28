'use client';

import { LABEL_CLS, LINK_CLS } from '../constants';
import { fmtDate } from '../utils';
import { B2BSellerTest, ClientEntity, FirmSpoc, SpocLogEntry, SpocRole, SpocSales } from '../../../models/client';
import { fmtShortINR } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnPrimary, inputCls } from '../../../constants/ui';
import { useState } from 'react';
import { istToday } from '../../../models/inbound';
import { repNames } from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import type { B2BTeam } from '@/lib/b2b/team/types';

export const SPOC_LABEL: Record<SpocRole, string> = { inbound: 'Inbound', outreach: 'Outreach', kam: 'KAM', ec: 'EC' };
const STAGE: Record<string, string> = { inbound: 'Inbound', outreach: 'Outreach', kam: 'KAM' };
const ROW = 'grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1.3fr)_52px] gap-3 items-baseline';
const LINK = `${LINK_CLS} text-right`;

export interface SpocReadState { linksLoading: boolean; linksFailed: boolean; ordersLoading: boolean; ordersFailed: boolean }

export const spocUnread = (role: SpocRole, s: SpocReadState) => (role === 'ec' ? s.ordersFailed : role !== 'kam' && s.linksFailed);
export const spocPending = (role: SpocRole, s: SpocReadState) => (role === 'ec' ? s.ordersLoading : role !== 'kam' && s.linksLoading);

export function SpocsCard({ client, spocs, isB2B, read, assignAs, people, onChangeKam, onSave }: {
  client: ClientEntity;
  spocs: FirmSpoc[];
  isB2B: B2BSellerTest;
  read: SpocReadState;
  assignAs?: string;
  people: Record<B2BTeam, Rep[]>;
  onChangeKam: () => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState<SpocLogEntry['role'] | null>(null);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (role: SpocLogEntry['role'], current?: string) => {
    setEditing(role);
    setName(current || '');
    setFrom(istToday());
    setError('');
  };

  const save = async () => {
    if (!editing || !name.trim() || !from) return;
    if (editing === 'ec' && isB2B(name)) {
      setError(`${name.trim()} is on the B2B team. The EC SPoC is the store person who serves this firm at an Experience Centre.`);
      return;
    }
    setBusy(true);
    setError('');
    const entry: SpocLogEntry = { role: editing, name: name.trim(), from, at: new Date().toISOString(), by: assignAs };
    const err = await onSave({ ...client, spocLog: [...(client.spocLog || []), entry] });
    setBusy(false);
    if (err) setError(err); else setEditing(null);
  };

  const team = editing && editing !== 'ec' ? people[editing] : [];
  const current = editing ? spocs.find((s) => s.role === editing)?.name : undefined;

  return (
    <SectionCard title="SPoCs" info="One SPoC per team. A firm can join at any stage, so any slot can stay empty.">
      <div className="flex flex-col gap-1.5">
        <div className={ROW}>
          <span className={LABEL_CLS}>Team</span>
          <span className={LABEL_CLS}>Person</span>
          <span className={LABEL_CLS}>How they hold it</span>
          <span />
        </div>
        {spocs.map((s) => {
          const unread = spocUnread(s.role, read);
          const pending = spocPending(s.role, read);
          return (
            <div key={s.role} className={ROW}>
              <span className="text-[12px] text-gray-500">{SPOC_LABEL[s.role]}</span>
              <span className="text-[12.5px] font-medium text-gray-900 truncate">
                {unread ? <span className="text-blue-700">Unknown</span> : pending ? <span className="text-gray-400">…</span> : s.name || <span className="text-gray-300 font-normal">Not filled</span>}
              </span>
              <span className="text-[12px] text-gray-500 truncate" title={s.detail}>
                {unread ? 'Could not be read' : [s.detail, s.since && `since ${fmtDate(s.since)}`].filter(Boolean).join(' · ')}
              </span>
              {assignAs !== undefined ? (
                <button onClick={() => (s.role === 'kam' ? onChangeKam() : open(s.role as SpocLogEntry['role'], s.name))} className={LINK}>
                  {s.name ? 'Change' : 'Add'}
                </button>
              ) : <span />}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="mt-3 flex items-end gap-2 flex-wrap border border-teal-100 bg-teal-50 rounded-md px-3 py-2">
          <label className="text-[11.5px] text-gray-600">{SPOC_LABEL[editing]} SPoC
            {team.length ? (
              <select value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} block mt-0.5`}>
                <option value="">Pick a person</option>
                {repNames(team, [current]).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} block mt-0.5`} />
            )}
          </label>
          <label className="text-[11.5px] text-gray-600">Since
            <input type="date" value={from} max={istToday()} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} block mt-0.5`} />
          </label>
          <button onClick={save} disabled={busy || !name.trim() || !from} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => setEditing(null)} className="text-[12px] text-gray-500">Cancel</button>
          {editing !== 'ec' && !team.length && <span className="w-full text-[12px] text-amber-700">The B2B team list did not load, so type the name.</span>}
          {error && <span className="w-full text-[12px] text-red-600">{error}</span>}
        </div>
      )}
    </SectionCard>
  );
}

export function SpocSalesCard({ sales, loading, failed }: { sales: SpocSales; loading: boolean; failed: boolean }) {
  const hasSales = sales.rows.length > 0 || sales.before.orders > 0;
  const th = 'py-1 pr-3 font-medium text-gray-500';
  return (
    <SectionCard
      title="Sales by SPoC"
      info="Each order counts for whoever held the firm when it was created. Read from the order list, so it can differ from the lifetime figure on Overview."
    >
      {failed ? (
        <p className="text-[12px] text-blue-700">Orders could not be read, so sales by SPoC are unknown.</p>
      ) : loading ? (
        <p className="text-[12px] text-gray-400">Loading orders…</p>
      ) : !hasSales ? (
        <p className="text-[12px] text-gray-500">No SPoC with a start date and no orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11.5px]">
                <th className={th}>Stage</th><th className={th}>SPoC</th><th className={th}>From</th>
                <th className={`${th} text-right`}>Orders</th><th className={`${th} text-right`}>Value</th><th className="py-1 font-medium text-gray-500 text-right">Per month</th>
              </tr>
            </thead>
            <tbody>
              {sales.before.orders > 0 && (
                <tr className="border-t border-gray-100 text-gray-500">
                  <td className="py-1 pr-3" colSpan={3}>Before the first SPoC on record</td>
                  <td className="py-1 pr-3 text-right">{sales.before.orders}</td><td className="py-1 pr-3 text-right">{fmtShortINR(sales.before.value)}</td><td className="py-1 text-right">—</td>
                </tr>
              )}
              {sales.rows.map((r) => (
                <tr key={`${r.role}-${r.from}-${r.name}`} className="border-t border-gray-100">
                  <td className="py-1 pr-3 text-gray-500">{STAGE[r.role]}</td>
                  <td className="py-1 pr-3 font-medium text-gray-900">{r.name}</td>
                  <td className="py-1 pr-3 text-gray-500">{fmtDate(r.from)}</td>
                  <td className="py-1 pr-3 text-right">{r.orders}</td>
                  <td className="py-1 pr-3 text-right">{fmtShortINR(r.value)}</td>
                  <td className="py-1 text-right">{fmtShortINR(r.perMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!failed && !loading && sales.undated.orders > 0 && (
        <p className="text-[12px] text-amber-800 mt-1">{sales.undated.orders} order{sales.undated.orders === 1 ? '' : 's'} worth {fmtShortINR(sales.undated.value)} had no date, so they are left out.</p>
      )}
      {!failed && !loading && sales.byEc.length > 0 && (
        <p className="text-[12px] text-gray-500 mt-1">
          Orders a store rep took, by EC SPoC, not added to the above: {sales.byEc.map((e) => `${e.name} ${fmtShortINR(e.value)}`).join(' · ')}
        </p>
      )}
    </SectionCard>
  );
}
