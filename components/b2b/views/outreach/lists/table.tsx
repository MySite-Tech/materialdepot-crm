'use client';

import { Empty } from '../../../ui/inbound-chips';
import { PAGE_SIZE } from '../constants';
import { LensRow } from '../types';
import { Col } from './columns';
import { ReactNode, useEffect, useState } from 'react';

const pager = 'px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40';

export function LensTable({ title, accent, rule, count, aside, note, cols, rows, empty, resetKey, onOpen }: {
  title: string;
  accent: string;
  rule: string;
  count: ReactNode;
  aside?: ReactNode;
  note?: ReactNode;
  cols: Col[];
  rows: LensRow[];
  empty: string;
  resetKey: string;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
            <h3 className="text-[13px] font-bold text-gray-900 truncate">{title}</h3>
            <span className="text-[12px] font-semibold text-gray-400 whitespace-nowrap">{count}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{rule}</p>
          {note && <div className="text-[11px] mt-1">{note}</div>}
        </div>
        {aside}
      </div>
      {!shown.length ? <div className="py-10"><Empty>{empty}</Empty></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {cols.map((c) => (
                  <th key={c.head} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{c.head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.lead.id} onClick={() => onOpen(r.lead.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer align-middle">
                  {cols.map((c) => <td key={c.head} className="px-3 py-2">{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">{`Showing ${at * PAGE_SIZE + 1}–${Math.min(rows.length, (at + 1) * PAGE_SIZE)} of ${rows.length}`}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(0, at - 1))} disabled={at === 0} className={pager}>← Prev</button>
            <button onClick={() => setPage(Math.min(pages - 1, at + 1))} disabled={at >= pages - 1} className={pager}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
