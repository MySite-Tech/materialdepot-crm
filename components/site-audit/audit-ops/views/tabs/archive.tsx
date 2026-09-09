'use client';

import { Chip } from '../../order-drawer/ui/fields';
import { AuditOrder, Auditor } from '../../types';
import { auditorNameOf, fmtDate } from '../../utils';
import { Addr, Customer, Empty, Head } from '../cells';
import { TD, TH } from '../../constants';
import { useState } from 'react';

export function DeletedView({ deleted, auditors, onRestore }: { deleted: AuditOrder[]; auditors: Auditor[]; onRestore: (o: AuditOrder) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <Head title="Deleted Orders" sub="Deleted orders are stored here permanently and can be restored to Pending at any time." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['PI / PO', 'Customer', 'Address', 'Date', 'Auditor', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {deleted.length ? deleted.map((o) => (
              <tr key={o.id}>
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b><div className="text-[11px] text-gray-400">{o.po.join(' · ')}</div></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[180px] text-gray-500`}><Addr o={o} /></td>
                <td className={TD}>{fmtDate(o.date)}</td>
                <td className={TD}>{o.auditor ? auditorNameOf(o, auditors) : '—'}</td>
                <td className={TD}>
                  <button disabled={busy === o.id} onClick={async () => { setBusy(o.id); await onRestore(o); setBusy(null); }} className="rounded-md bg-[#EAB308] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
                    {busy === o.id ? 'Restoring…' : 'Restore'}
                  </button>
                </td>
              </tr>
            )) : <Empty cols={6} msg="No deleted orders." />}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RectificationsView({ orders, onOpenOrder }: { orders: AuditOrder[]; onOpenOrder: (pi: string) => void }) {
  const list = orders.filter((o) => o.service && o.service.rectification_of);
  return (
    <>
      <Head title="Rectifications" sub="New service orders raised to address post-completion issues. Click a row to manage." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['Rectification PI', 'Original PI', 'Customer', 'Issue', 'Status'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {list.length ? list.map((o) => (
              <tr key={o.id} onClick={() => onOpenOrder(o.pi)} className="cursor-pointer hover:bg-gray-50">
                <td className={TD}><b className="font-mono text-xs">{o.pi}</b></td>
                <td className={TD}><b className="font-mono text-xs">{o.service!.rectification_of}</b></td>
                <td className={TD}><Customer o={o} /></td>
                <td className={`${TD} max-w-[220px] text-[12px] text-gray-500`}>{o.service!.issue || '—'}</td>
                <td className={TD}><Chip st={o.status} /></td>
              </tr>
            )) : <Empty cols={5} msg="No rectifications raised yet." />}
          </tbody>
        </table>
      </div>
    </>
  );
}
