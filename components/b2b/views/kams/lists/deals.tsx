'use client';

import { KAM_LENS, KAM_LIST_PAGE_SIZE } from '../../../models/kam';
import { fmtINR } from '../../../models/mock-data';
import { KamDealLens, KamTicketRow } from '../../../types/kam';
import { DealInline } from '../../../ui/deal-detail';
import { fmtDay } from '../../../ui/inbound-chips';
import { TicketFollowUpLog, TicketLast, TicketNext } from '../../../ui/ticket-follow-ups';
import { FirmCell, ListHead, Pager, td, th } from './ui';
import { Fragment, useEffect, useState } from 'react';

const ageDays = (day: string, today: string) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000));

export function KamDealTable({ lens, rows, today, search, since, notice, page, setPage, onOpen, onLog }: {
  lens: KamDealLens;
  rows: KamTicketRow[];
  today: string;
  search: string;
  since?: string;
  notice?: React.ReactNode;
  page: number;
  setPage: (p: number) => void;
  onOpen: (clientId: string) => void;
  onLog: (t: KamTicketRow) => void;
}) {
  const meta = KAM_LENS[lens];
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => { setShown(null); }, [lens, page]);
  const pages = Math.max(1, Math.ceil(rows.length / KAM_LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * KAM_LIST_PAGE_SIZE, (cur + 1) * KAM_LIST_PAGE_SIZE);
  const value = rows.reduce((a, t) => a + (t.deal.value || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <ListHead
        accent={meta.accent}
        title={search ? `${meta.title} matching “${search}”` : meta.title}
        count={rows.length}
        extra={value ? `${fmtINR(value)} open` : undefined}
        rule={`${meta.rule}${since ? ` Tickets opened since ${fmtDay(since)}.` : ''}`}
      />
      {notice}
      {!rows.length ? (
        <p className="py-10 text-center text-[12px] text-gray-400">{search ? `No cart or PI here matches “${search}”.` : meta.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                <th className={th}>Firm</th>
                <th className={th}>Cart / PI</th>
                <th className={th}>Last follow-up</th>
                <th className={th}>Next follow-up</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const d = t.deal;
                const open = shown === t.key;
                const age = ageDays(d.createdOn, today);
                return (
                  <Fragment key={t.key}>
                    <tr onClick={() => setShown(open ? null : t.key)} className={`border-t border-gray-100 cursor-pointer ${open ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}>
                      <td className={td}>
                        <FirmCell r={t.firm} />
                        <button onClick={(e) => { e.stopPropagation(); onOpen(t.firm.client.id); }} className="text-[11px] font-medium text-[#0F766E] hover:underline">Open firm</button>
                      </td>
                      <td className={`${td} min-w-[230px]`}>
                        <span className="flex items-baseline gap-1.5">
                          <span className={`text-[10px] font-semibold rounded px-1 ${d.kind === 'pi' ? 'bg-purple-50 text-purple-700' : 'bg-indigo-50 text-indigo-700'}`}>{d.kind === 'pi' ? 'PI' : 'Cart'}</span>
                          <span className="font-mono font-semibold text-gray-800">{fmtINR(d.value)}</span>
                          <span className="text-[11px] text-gray-400">{d.status}</span>
                        </span>
                        <div className="text-[11px] text-gray-500"><span className="font-mono">{d.enqId}</span> · opened {fmtDay(d.createdOn)} <span className={age > 14 ? 'text-amber-700 font-semibold' : ''}>({age}d)</span></div>
                        {(d.branch || d.bm) && <div className="text-[11px] text-gray-400">{[d.branch, d.bm].filter(Boolean).join(' · ')}</div>}
                        <span className="text-[11px] font-medium text-indigo-700">{open ? 'Hide products and follow-ups ▴' : 'Products and follow-ups ▾'}</span>
                      </td>
                      <td className={td}><TicketLast f={t.touched ? t.followUp : undefined} /></td>
                      <td className={td}><TicketNext f={t.followUp} touched={t.touched} today={today} /></td>
                      <td className={`${td} text-right`}>
                        <button onClick={(e) => { e.stopPropagation(); onLog(t); }} className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white text-[11.5px] font-semibold whitespace-nowrap hover:bg-[#0D5F58]">Log follow-up</button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-gray-50">
                        <td colSpan={5} className="px-3 pb-3 pt-0">
                          <DealInline
                            enqId={d.enqId}
                            actions={<TicketFollowUpLog f={t.followUp} label={d.kind === 'pi' ? 'PI' : 'cart'} onLog={() => onLog(t)} />}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
