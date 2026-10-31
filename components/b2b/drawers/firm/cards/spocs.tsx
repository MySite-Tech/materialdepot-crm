'use client';

import { fmtDate } from '../utils';
import { ClientEntity, FirmLinks, SpocLogEntry, SpocRole, firmSpocs, spocSales } from '../../../models/client';
import { fmtShortINR } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnPrimary, inputCls } from '../../../constants/ui';
import type { ClientOrderRow } from '@/lib/b2b';
import { useMemo, useState } from 'react';
import { istToday } from '../../../models/inbound';

const LABEL: Record<SpocRole, string> = { inbound: 'Inbound SPoC', outreach: 'Outreach SPoC', kam: 'KAM SPoC', ec: 'EC SPoC' };
const STAGE: Record<string, string> = { inbound: 'Inbound', outreach: 'Outreach', kam: 'KAM' };

export function SpocsCard({ client, links, linksLoading, linksFailed, orders, ordersLoading, ordersFailed, assignAs, onSave }: {
  client: ClientEntity;
  links: FirmLinks;
  linksLoading: boolean;
  linksFailed: boolean;
  orders: ClientOrderRow[];
  ordersLoading: boolean;
  ordersFailed: boolean;
  assignAs?: string;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState<SpocLogEntry['role'] | null>(null);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const spocs = useMemo(() => firmSpocs(client, links, orders), [client, links, orders]);
  const sales = useMemo(() => spocSales(client, spocs, orders, Date.now()), [client, spocs, orders]);

  const open = (role: SpocLogEntry['role'], current?: string) => {
    setEditing(role);
    setName(current || '');
    setFrom(istToday());
    setError('');
  };

  const save = async () => {
    if (!editing || !name.trim() || !from) return;
    setBusy(true);
    setError('');
    const entry: SpocLogEntry = { role: editing, name: name.trim(), from, at: new Date().toISOString(), by: assignAs };
    const err = await onSave({ ...client, spocLog: [...(client.spocLog || []), entry] });
    setBusy(false);
    if (err) setError(err); else setEditing(null);
  };

  const unread = (role: SpocRole) => (role === 'ec' ? ordersFailed : role !== 'kam' && linksFailed);
  const pending = (role: SpocRole) => (role === 'ec' ? ordersLoading : role !== 'kam' && linksLoading);
  const hasSales = sales.rows.length > 0 || sales.before.orders > 0;

  return (
    <SectionCard title="People on this firm" subtitle="One SPoC per team. A firm can join at any stage, so any slot can stay empty">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {spocs.map((s) => (
          <div key={s.role} className="border border-gray-100 rounded-md px-3 py-2 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{LABEL[s.role]}</div>
            <div className="text-[13px] font-semibold text-gray-800 truncate">
              {unread(s.role) ? <span className="text-blue-700">Unknown</span> : pending(s.role) ? <span className="text-gray-400">…</span> : s.name || <span className="text-gray-400 font-normal">Not filled</span>}
            </div>
            <div className="text-[11px] text-gray-500">{unread(s.role) ? 'Could not be read' : s.detail}</div>
            {s.since && !unread(s.role) && <div className="text-[11px] text-gray-400">Since {fmtDate(s.since)}</div>}
            {assignAs !== undefined && s.role !== 'kam' && (
              <button onClick={() => open(s.role as SpocLogEntry['role'], s.name)} className="mt-1 text-[11px] font-semibold text-[#0F766E] hover:underline">
                {s.name ? 'Change' : 'Add'}
              </button>
            )}
            {s.role === 'kam' && <div className="mt-1 text-[11px] text-gray-400">Change under Account</div>}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-2 flex items-end gap-2 flex-wrap border border-teal-100 bg-teal-50 rounded-md px-3 py-2">
          <label className="text-[11px] text-gray-600">{LABEL[editing]}
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-600">Since
            <input type="date" value={from} max={istToday()} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} block mt-0.5`} />
          </label>
          <button onClick={save} disabled={busy || !name.trim() || !from} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => setEditing(null)} className="text-[11px] text-gray-500">Cancel</button>
          {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
        </div>
      )}

      <div className="mt-3">
        <div className="text-[11px] font-semibold text-gray-700">Sales by SPoC</div>
        {ordersFailed ? (
          <p className="text-[11px] text-blue-700 mt-1">Orders could not be read, so sales by SPoC are unknown.</p>
        ) : ordersLoading ? (
          <p className="text-[11px] text-gray-400 mt-1">Loading orders…</p>
        ) : !hasSales ? (
          <p className="text-[11px] text-gray-500 mt-1">No SPoC with a start date and no orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] mt-1">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-1 pr-3">Stage</th><th className="py-1 pr-3">SPoC</th><th className="py-1 pr-3">From</th>
                  <th className="py-1 pr-3 text-right">Orders</th><th className="py-1 pr-3 text-right">Value</th><th className="py-1 text-right">Per month</th>
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
                    <td className="py-1 pr-3 font-semibold text-gray-800">{r.name}</td>
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
        {!ordersFailed && !ordersLoading && sales.undated.orders > 0 && (
          <p className="text-[11px] text-amber-800 mt-1">{sales.undated.orders} order{sales.undated.orders === 1 ? '' : 's'} worth {fmtShortINR(sales.undated.value)} had no date, so they are left out.</p>
        )}
        {!ordersFailed && !ordersLoading && sales.byEc.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-1">
            The same orders by EC BM, not added to the above: {sales.byEc.map((e) => `${e.name} ${fmtShortINR(e.value)}`).join(' · ')}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">Each order counts for whoever held the firm when it was created. Read from the order list, so it can differ from the lifetime figure above.</p>
      </div>
    </SectionCard>
  );
}
