'use client';

import { fmtL } from '../../../../../models/mock-data';
import { useEffect, useState } from 'react';
import { PAGE_SIZE } from '../constants';
import type { ListRow } from '../types';

export function ClientList({ title, rows, labels, onClose }: {
  title: string;
  rows: ListRow[];
  labels?: { now?: string; before?: string; value?: string };
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [title]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-[12px] font-bold text-gray-700">{title}</h3>
        <button onClick={onClose} className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer">Close</button>
      </div>
      {!rows.length ? (
        <p className="text-[12px] text-gray-400">No clients.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-semibold">Client</th>
                  <th className="py-1.5 pr-3 font-semibold">{labels?.now ?? 'This month'}</th>
                  <th className="py-1.5 pr-3 font-semibold">{labels?.before ?? 'Before'}</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Orders</th>
                  <th className="py-1.5 font-semibold text-right">{labels?.value ?? 'B2B revenue'}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-800 font-medium max-w-[280px] truncate" title={r.name}>{r.name}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{r.now}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{r.before}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{r.orders ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">{fmtL(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
            <span className="tabular-nums">Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="px-2 py-1 border border-gray-200 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default">Prev</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} className="px-2 py-1 border border-gray-200 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
