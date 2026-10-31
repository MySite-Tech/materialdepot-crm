'use client';

import { fmtINR } from '../../../models/mock-data';
import { OPEN_PAGE_SIZE, OPEN_ROWS_CAP, OPEN_STATUSES } from '../constants';
import { CRMLeadRow, fetchCRMLeads } from '@/lib/api';
import { B2B_STATS_BRANCH } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

const day = (iso: string | undefined): string =>
  (iso ? String(iso).slice(0, 10) : '') || '—';

export function OpenPipelineDrawer({ from, to, rangeLabel, value, count, onClose }: {
  from?: string;
  to?: string;
  rangeLabel: string;
  value: number;
  count: number;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CRMLeadRow[] | null>(null);
  const [serverCount, setServerCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setFailed(false);
    fetchCRMLeads({
      branch: B2B_STATS_BRANCH,
      status: OPEN_STATUSES.join(','),
      createdFrom: from,
      createdTo: to,
      page: 1,
      pageSize: OPEN_ROWS_CAP,
      sortBy: 'cartValue',
      sortDir: 'desc',
    })
      .then((r) => { if (alive) { setRows(r.results); setServerCount(r.count); } })
      .catch((e) => {
        console.error('[b2b] open pipeline fetch failed', e);
        if (alive) setFailed(true);
      });
    return () => { alive = false; };
  }, [from, to]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((r) =>
      `${r.clientName || ''} ${r.clientPhone || ''} ${r.assignedTo || ''}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / OPEN_PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * OPEN_PAGE_SIZE, curPage * OPEN_PAGE_SIZE);
  const truncated = !!rows && serverCount > rows.length;

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[980px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">

        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900">Open pipeline</h2>
              <div className="text-[12px] text-gray-500 mt-1">
                <span className="font-mono font-semibold text-gray-700">{fmtINR(Math.round(value))}</span>
                {' '}across {count} open {count === 1 ? 'cart' : 'carts'} · carts created {rangeLabel.toLowerCase()}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                Open means {OPEN_STATUSES.join(', ')} — no order placed yet.
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
          </div>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Filter by client, phone or owner"
            className="mt-3 w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]"
          />
        </div>

        <div className="p-5 flex-1">
          {failed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
              <span className="font-semibold">These carts could not be read.</span>{' '}
              The pipeline figure above came from a different call and is still good — this list is missing,
              which is not the same as no open carts. Close and reopen to retry.
            </div>
          )}

          {!failed && !rows && <div className="text-[12px] text-gray-400 py-8 text-center">Loading open carts…</div>}

          {!failed && rows && !filtered.length && (
            <div className="text-[12px] text-gray-400 py-8 text-center">
              {rows.length ? 'No open cart matches that filter.' : 'No open carts in this period.'}
            </div>
          )}

          {!failed && !!filtered.length && (
            <>
              {truncated && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
                  <span className="font-semibold">Showing the {rows!.length} largest of {serverCount} open carts.</span>{' '}
                  The total above still counts all {serverCount}. Narrow the range to see the rest.
                </div>
              )}
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="text-left font-semibold px-3 py-2">Client</th>
                      <th className="text-left font-semibold px-3 py-2">Owner</th>
                      <th className="text-left font-semibold px-3 py-2">Status</th>
                      <th className="text-right font-semibold px-3 py-2">Cart value</th>
                      <th className="text-left font-semibold px-3 py-2">Created</th>
                      <th className="text-left font-semibold px-3 py-2">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{r.clientName || '—'}</div>
                          <div className="font-mono text-[11px] text-gray-400">{r.clientPhone || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.assignedTo || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.status || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800">
                          {fmtINR(Math.round(r.cartValue || 0))}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-500">{day(r.createdAt)}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{day(r.followUpDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length > OPEN_PAGE_SIZE && (
                <div className="flex items-center justify-between text-[12px] text-gray-500 mt-3">
                  <span>
                    Showing {(curPage - 1) * OPEN_PAGE_SIZE + 1}–{Math.min(curPage * OPEN_PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={curPage <= 1}
                      onClick={() => setPage(curPage - 1)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={curPage >= totalPages}
                      onClick={() => setPage(curPage + 1)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
