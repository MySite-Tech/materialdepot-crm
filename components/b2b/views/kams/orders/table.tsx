'use client';

import { KAM_LENS, KAM_LIST_PAGE_SIZE, KAM_ORDER_STATUS_COLORS } from '../../../models/kam';
import { daysUntil } from '../../../models/inbound';
import { fmtL } from '../../../models/mock-data';
import { KamOrder, KamOrderLens } from '../../../types/kam';
import { Pager } from '../ui';

const th = 'text-left font-semibold px-3 py-2 whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';

export function KamOrderTable({ lens, rows, today, search, valueText, page, setPage, onOpen }: {
  lens: KamOrderLens;
  rows: KamOrder[];
  today: string;
  search: string;
  valueText?: string;
  page: number;
  setPage: (p: number) => void;
  onOpen: (o: KamOrder) => void;
}) {
  const meta = KAM_LENS[lens];
  const pages = Math.max(1, Math.ceil(rows.length / KAM_LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * KAM_LIST_PAGE_SIZE, (cur + 1) * KAM_LIST_PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: meta.accent }} />
          <h2 className="text-[14px] font-bold text-gray-900">{search ? `${meta.title} matching “${search}”` : meta.title}</h2>
          <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{rows.length}</span>
          {valueText && <span className="text-[12px] font-semibold text-gray-600">· {valueText}</span>}
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{meta.rule}</p>
      </div>

      {!rows.length ? (
        <p className="py-10 text-center text-[12px] text-gray-400">{search ? `No order here matches “${search}”.` : meta.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                <th className={th}>Firm</th>
                <th className={th}>Status</th>
                <th className={th}>Enq ID</th>
                <th className={`${th} text-right`}>Ticket value</th>
                <th className={`${th} text-right`}>Estimate</th>
                <th className={th}>In status</th>
                <th className={th}>Expected close</th>
                <th className={th}>Requirement</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const since = o.statusChangedAt ? Math.abs(daysUntil(String(o.statusChangedAt).slice(0, 10), today) ?? 0) : undefined;
                const c = KAM_ORDER_STATUS_COLORS[o.status];
                return (
                  <tr key={o.id} onClick={() => onOpen(o)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                    <td className={`${td} max-w-[220px]`}>
                      <div className="font-semibold text-gray-800 truncate">{o.company}</div>
                      <div className="text-[10px] text-gray-400 truncate">{o.kam}{o.clientId ? '' : ' · not linked to a firm'}</div>
                    </td>
                    <td className={td}>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: c + '18', color: c }}>{o.status}</span>
                    </td>
                    <td className={`${td} font-mono text-gray-600 whitespace-nowrap`}>
                      {o.enqId || <span className="font-sans text-amber-600 font-semibold">{o.status === 'PI Shared' ? 'Missing' : '—'}</span>}
                    </td>
                    <td className={`${td} text-right font-mono font-semibold text-gray-800 whitespace-nowrap`}>
                      {o.orderValue !== undefined ? fmtL(o.orderValue) : <span className="font-sans font-normal text-gray-300">no ticket</span>}
                    </td>
                    <td className={`${td} text-right font-mono text-gray-400 whitespace-nowrap`} title="The KAM's estimate, never counted as revenue">
                      {o.estimatedValue !== undefined ? fmtL(o.estimatedValue) : '—'}
                    </td>
                    <td className={`${td} whitespace-nowrap text-gray-500`}>{since !== undefined ? `${since}d` : '—'}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-gray-500`}>{o.expectedClosure || '—'}</td>
                    <td className={`${td} max-w-[260px] text-gray-500`}>
                      <div className="truncate" title={o.requirement}>{o.requirement || '—'}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && <Pager total={rows.length} page={cur} pages={pages} size={KAM_LIST_PAGE_SIZE} setPage={setPage} />}
    </div>
  );
}
