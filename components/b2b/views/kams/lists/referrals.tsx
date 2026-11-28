'use client';

import { KAM_LENS, KAM_LIST_PAGE_SIZE } from '../../../models/kam';
import { fmtINR } from '../../../models/mock-data';
import { KamReferralLens, KamReferralRow, ReferralStage } from '../../../types/kam';
import { DealInline } from '../../../ui/deal-detail';
import { fmtDay } from '../../../ui/inbound-chips';
import { ListHead, Pager, td, th } from './ui';
import { Fragment, useEffect, useState } from 'react';

const STAGE: Record<ReferralStage, { label: string; cls: string }> = {
  none:    { label: 'Not at an EC yet', cls: 'bg-red-50 text-red-700' },
  cart:    { label: 'Cart, no order', cls: 'bg-amber-50 text-amber-800' },
  ordered: { label: 'Ordered', cls: 'bg-emerald-50 text-emerald-700' },
  unknown: { label: 'Unknown', cls: 'bg-blue-50 text-blue-700' },
};

const daysSince = (day: string | undefined, today: string) =>
  day ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000) : undefined;

export function KamReferralTable({ lens, rows, today, search, page, setPage, onOpen }: {
  lens: KamReferralLens;
  rows: KamReferralRow[];
  today: string;
  search: string;
  page: number;
  setPage: (p: number) => void;
  onOpen: (clientId: string) => void;
}) {
  const meta = KAM_LENS[lens];
  const [shown, setShown] = useState<{ key: string; enqId: string } | null>(null);
  useEffect(() => { setShown(null); }, [lens, page]);
  const pages = Math.max(1, Math.ceil(rows.length / KAM_LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * KAM_LIST_PAGE_SIZE, (cur + 1) * KAM_LIST_PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <ListHead accent={meta.accent} title={search ? `${meta.title} matching “${search}”` : meta.title} count={rows.length} rule={meta.rule} />
      {!rows.length ? (
        <p className="py-10 text-center text-[12px] text-gray-400">{search ? `No referred client matches “${search}”.` : meta.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                <th className={th}>Referred client</th>
                <th className={th}>Referred by</th>
                <th className={th}>Referred on</th>
                <th className={th}>Where they are</th>
                <th className={th}>Cart / order</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const age = daysSince(r.referredOn, today);
                const d = r.open[0];
                const open = shown?.key === r.key ? shown.enqId : '';
                return (
                  <Fragment key={r.key}>
                    <tr onClick={() => onOpen(r.firm.client.id)} title="Open the firm" className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                      <td className={td}>
                        <div className="font-semibold text-gray-800">{r.name}</div>
                        <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[11px] text-gray-500 hover:text-[#0F766E]">{r.phone}</a>
                        {r.note && <div className="text-[10.5px] text-gray-400 max-w-[220px] truncate" title={r.note}>{r.note}</div>}
                      </td>
                      <td className={td}>
                        <div className="text-gray-800">{r.firm.company}</div>
                        <div className="text-[10.5px] text-gray-400">{[r.firm.client.kam || 'No KAM', r.via === 'studio' ? 'added on Studio Space' : r.addedBy ? `added by ${r.addedBy}` : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.referredOn ? fmtDay(r.referredOn) : <span className="text-gray-300">—</span>}
                        {age !== undefined && <div className={`text-[10.5px] ${r.stage === 'none' && age > 7 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{age}d ago</div>}
                      </td>
                      <td className={td}><span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap ${STAGE[r.stage].cls}`}>{STAGE[r.stage].label}</span></td>
                      <td className={`${td} whitespace-nowrap`}>
                        {d ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShown(open ? null : { key: r.key, enqId: d.enqId }); }}
                            className="text-left rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-indigo-50/60"
                          >
                            <span className="text-[11px] text-gray-700">{d.kind === 'pi' ? 'PI' : 'Cart'} {fmtINR(d.value)} · {d.branch || 'EC'}</span>
                            <span className="block text-[11px] font-medium text-indigo-700">{open ? 'Hide products' : 'View products'}</span>
                          </button>
                        ) : r.orders ? (
                          <span className="text-gray-700">{r.orders} order{r.orders === 1 ? '' : 's'}{r.lastOrder ? ` · last ${fmtDay(r.lastOrder)}` : ''}</span>
                        ) : r.enquiries ? (
                          <span className="text-gray-500">{r.enquiries} enquir{r.enquiries === 1 ? 'y' : 'ies'}, none open</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-gray-50">
                        <td colSpan={5} className="px-3 pb-3 pt-0"><DealInline enqId={open} /></td>
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
