'use client';

import { Fragment, useEffect, useState } from 'react';
import { REFERRAL_STAGE, REFERRED_LENS } from '../constants/referral';
import { fmtINR } from '../models/mock-data';
import type { ReferredRow, ReferredState } from '../types/referred';
import { DealInline } from './deal-detail';
import { fmtDay, Spinner } from './inbound-chips';
import { StudioReferralDetailPanel } from './studio-referral-detail';

const PAGE = 25;
const th = 'px-3 py-2 text-left font-semibold';
const td = 'px-3 py-2.5 align-top';

const daysSince = (day: string, today: string) =>
  day ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000) : undefined;

export function ReferredClientsTable({ state, today, referrerLabel, onOpenReferrer }: {
  state: ReferredState;
  today: string;
  referrerLabel: string;
  onOpenReferrer?: (referrerId: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [deal, setDeal] = useState<{ key: string; enqId: string } | null>(null);
  const [studio, setStudio] = useState<string | null>(null);
  const { rows } = state;
  useEffect(() => { setPage(0); setDeal(null); setStudio(null); }, [rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * PAGE, (cur + 1) * PAGE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: REFERRED_LENS.accent }} />
          <h3 className="text-[14px] font-semibold text-gray-900">{REFERRED_LENS.title}</h3>
          <span className="text-[12px] text-gray-400">{rows.length}</span>
        </div>
        <p className="text-[12px] text-gray-500 mt-1">{REFERRED_LENS.rule}</p>
      </div>
      {state.status === 'pending' ? <div className="py-10"><Spinner label="Reading referred clients…" /></div>
        : state.status === 'failed' ? <p className="py-8 text-center text-[12px] text-amber-700">The referral list did not load ({state.error}). This does not mean there are none.</p>
          : !rows.length ? <p className="py-10 text-center text-[12px] text-gray-400">{REFERRED_LENS.empty}</p>
            : (
              <>
                {state.historyFailed && <p className="px-4 py-2 text-[11.5px] text-amber-700 bg-amber-50 border-b border-amber-100">Order history did not load, so Where they are reads Unknown.</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                        <th className={th}>Referred client</th>
                        <th className={th}>{referrerLabel}</th>
                        <th className={th}>Referred on</th>
                        <th className={th}>Where they are</th>
                        <th className={th}>Cart / order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r: ReferredRow) => {
                        const age = daysSince(r.referredOn, today);
                        const d = r.open[0];
                        const dealOpen = deal?.key === r.key ? deal.enqId : '';
                        return (
                          <Fragment key={r.key}>
                            <tr className="border-t border-gray-100">
                              <td className={td}>
                                <div className="font-semibold text-gray-800">{r.name}</div>
                                <a href={`tel:${r.phone}`} className="font-mono text-[11px] text-gray-500 hover:text-[#0F766E]">{r.phone}</a>
                                {r.note && <div className="text-[10.5px] text-gray-400 max-w-[220px] truncate" title={r.note}>{r.note}</div>}
                                {r.onStudio && (
                                  <button onClick={() => setStudio(studio === r.key ? null : r.key)} className="block text-[11px] font-medium text-indigo-700 hover:underline">
                                    {studio === r.key ? 'Hide Studio Space details' : 'Studio Space details'}
                                  </button>
                                )}
                              </td>
                              <td className={td}>
                                {onOpenReferrer
                                  ? <button onClick={() => onOpenReferrer(r.referrerId)} className="text-gray-800 hover:underline text-left">{r.referrer}</button>
                                  : <div className="text-gray-800">{r.referrer}</div>}
                                {r.addedBy && <div className="text-[10.5px] text-gray-400">added by {r.addedBy}</div>}
                              </td>
                              <td className={`${td} whitespace-nowrap`}>
                                {r.referredOn ? fmtDay(r.referredOn) : <span className="text-gray-300">—</span>}
                                {age !== undefined && <div className={`text-[10.5px] ${r.stage === 'none' && age > 7 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{age}d ago</div>}
                              </td>
                              <td className={td}><span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap ${REFERRAL_STAGE[r.stage].cls}`}>{REFERRAL_STAGE[r.stage].label}</span></td>
                              <td className={`${td} whitespace-nowrap`}>
                                {d ? (
                                  <button onClick={() => setDeal(dealOpen ? null : { key: r.key, enqId: d.enqId })} className="text-left rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-indigo-50/60">
                                    <span className="text-[11px] text-gray-700">{d.kind === 'pi' ? 'PI' : 'Cart'} {fmtINR(d.value)} · {d.branch || 'EC'}</span>
                                    <span className="block text-[11px] font-medium text-indigo-700">{dealOpen ? 'Hide products' : 'View products'}</span>
                                  </button>
                                ) : r.orders ? (
                                  <span className="text-gray-700">{r.orders} order{r.orders === 1 ? '' : 's'}{r.lastOrder ? ` · last ${fmtDay(r.lastOrder)}` : ''}</span>
                                ) : r.enquiries ? (
                                  <span className="text-gray-500">{r.enquiries} enquir{r.enquiries === 1 ? 'y' : 'ies'}, none open</span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                            {studio === r.key && (
                              <tr className="border-t border-gray-50"><td colSpan={5} className="px-3 pb-3 pt-0"><StudioReferralDetailPanel phone={r.phone} /></td></tr>
                            )}
                            {dealOpen && (
                              <tr className="border-t border-gray-50"><td colSpan={5} className="px-3 pb-3 pt-0"><DealInline enqId={dealOpen} /></td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-[12px] text-gray-500">
                    <span>Showing {cur * PAGE + 1}–{Math.min(rows.length, (cur + 1) * PAGE)} of {rows.length}</span>
                    <span className="flex gap-2">
                      <button disabled={cur === 0} onClick={() => setPage(cur - 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">Prev</button>
                      <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">Next</button>
                    </span>
                  </div>
                )}
              </>
            )}
    </div>
  );
}
