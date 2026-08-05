'use client';

import { useState } from 'react';
import { Chip, EmptyRow, MapLink } from './ui';
import { fmtDate } from './shared';
import type { InstallOrder } from './types';

function RestoreBtn({ id, pi, onRestore }: { id: string | number | null; pi: string; onRestore: (id: string | number, pi: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-60"
      disabled={busy || !id}
      onClick={async () => { setBusy(true); try { await onRestore(id!, pi); } catch { setBusy(false); } }}
    >
      {busy ? 'Restoring…' : 'Restore'}
    </button>
  );
}

export function DeletedView({ deleted, onRestore }: { deleted: InstallOrder[]; onRestore: (id: string | number, pi: string) => Promise<void> }) {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Deleted Orders</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">All deleted install orders. Restore any order to move it back to Pending.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>{['PI / PO', 'SKUs', 'Customer', 'Address', 'Delivery Date', 'Action'].map((h) => <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {deleted.length ? deleted.map((o) => (
              <tr key={o.id ?? o.pi} className="border-t border-gray-100">
                <td className="px-3 py-2.5 text-[13px] align-top">
                  <div className="font-mono text-xs font-extrabold text-[#1F3A5F]">{o.pi}</div>
                  <div className="font-mono text-[11px] text-gray-400">{o.po.join(' · ')}</div>
                </td>
                <td className="px-3 py-2.5 text-[13px] align-top"><div className="flex flex-wrap gap-1">{o.skus.map((s, i) => <span key={i} className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-gray-100 text-[#1F3A5F]">{s.c}</span>)}</div></td>
                <td className="px-3 py-2.5 text-[13px] align-top"><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                <td className="px-3 py-2.5 text-[13px] align-top w-[170px] max-w-[170px]"><MapLink addr={o.addr} /></td>
                <td className="px-3 py-2.5 text-[13px] align-top">{fmtDate(o.deliveryDate)}</td>
                <td className="px-3 py-2.5 text-[13px] align-top"><RestoreBtn id={o.id} pi={o.pi} onRestore={onRestore} /></td>
              </tr>
            )) : <EmptyRow colSpan={6}>No deleted orders.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RectificationsView({ orders, onOpenOrder }: { orders: InstallOrder[]; onOpenOrder: (pi: string) => void }) {
  const rects = orders.filter((o) => o.service && o.service.rectification_of);
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Rectifications</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">New service orders raised to address post-completion issues. Click a row to manage.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>{['Rectification PI', 'Original PI', 'Customer', 'Issue', 'Status'].map((h) => <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rects.length ? rects.map((o) => (
              <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer border-t border-gray-100" onClick={() => onOpenOrder(o.pi)}>
                <td className="px-3 py-2.5 text-[13px]"><span className="font-mono font-extrabold text-[#1F3A5F]">{o.pi}</span></td>
                <td className="px-3 py-2.5 text-[13px]"><span className="font-mono font-extrabold text-[#1F3A5F]">{o.service!.rectification_of}</span></td>
                <td className="px-3 py-2.5 text-[13px]"><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></td>
                <td className="px-3 py-2.5 text-[12px] text-gray-500 max-w-[220px]">{o.service!.issue || '—'}</td>
                <td className="px-3 py-2.5 text-[13px]"><Chip st={o.status} /></td>
              </tr>
            )) : <EmptyRow colSpan={5}>No rectifications raised yet.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}
