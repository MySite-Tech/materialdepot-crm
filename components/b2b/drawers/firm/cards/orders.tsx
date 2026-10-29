'use client';

import { ORDER_PAGE_SIZE, ORDER_TABS } from '../constants';
import { OrderTab, fmtDate, fmtPhone, orderTab } from '../utils';
import { fmtINR } from '../../../models/mock-data';
import { SectionCard, Spinner } from '../../../ui/inbound-chips';
import { EnquiryDetail } from './enquiry';
import { ClientOrderDetails, ClientOrderRow } from '@/lib/b2b';
import { Fragment, useEffect, useMemo, useState } from 'react';

function EnqChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
  };
  return (
    <button onClick={(e) => { e.stopPropagation(); copy(); }} title="Copy enquiry ID"
      className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded px-1.5 py-0.5 cursor-pointer whitespace-nowrap">
      {id || '—'}
      <span className="text-[9px] font-sans font-semibold text-gray-400">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

function StatusChip({ r }: { r: ClientOrderRow }) {
  const tone = r.ordered ? ['#15803D', '#22C55E'] : r.lost ? ['#B91C1C', '#EF4444'] : ['#B45309', '#F59E0B'];
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: tone[1] + '18', color: tone[0] }}>
      {r.status || '—'}
    </span>
  );
}

export function OrdersCard({ details, loading, failed, numbers, via, onClearVia, onRecheck }: {
  details: ClientOrderDetails | null;
  loading: boolean;
  failed: boolean;
  numbers: number;
  via: string | null;
  onClearVia: () => void;
  onRecheck: () => void;
}) {
  const [tab, setTab] = useState<OrderTab>('placed');
  const [page, setPage] = useState(1);
  const [openEnq, setOpenEnq] = useState<string | null>(null);

  const scoped = useMemo(
    () => (details?.rows || []).filter((r) => !via || r.contactNumber === via),
    [details, via],
  );
  const byTab = useMemo(() => {
    const out: Record<OrderTab, ClientOrderRow[]> = { placed: [], open: [], lost: [] };
    for (const r of scoped) out[orderTab(r)].push(r);
    return out;
  }, [scoped]);

  useEffect(() => { setPage(1); setOpenEnq(null); }, [tab, via]);

  const list = byTab[tab];
  const totalPages = Math.max(1, Math.ceil(list.length / ORDER_PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = list.slice((curPage - 1) * ORDER_PAGE_SIZE, curPage * ORDER_PAGE_SIZE);
  const showVia = numbers > 1 && !via;
  const showCompany = list.some((r) => r.companyOnOrder);
  const showGst = list.some((r) => r.gstOnOrder);
  const failedPhones = details?.failedPhones || [];
  const rejected = details?.rejected || 0;

  return (
    <SectionCard
      title="Enquiries & orders"
      subtitle={details ? `${scoped.length} enquir${scoped.length === 1 ? 'y' : 'ies'} ${via ? `on ${fmtPhone(via)}` : numbers > 1 ? `across all ${numbers} numbers` : 'on this number'} · click one for its cart and history` : undefined}
      right={<button onClick={onRecheck} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">Re-check</button>}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 mb-2 flex-wrap">
        {ORDER_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-[12px] font-semibold -mb-px border-b-2 cursor-pointer ${tab === t.key ? 'border-[#0F766E] text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t.label}
            <span className={`ml-1.5 font-mono text-[11px] ${tab === t.key ? 'text-[#0F766E]' : 'text-gray-300'}`}>{byTab[t.key].length}</span>
          </button>
        ))}
        {via && (
          <button onClick={onClearVia} className="ml-auto text-[11px] text-gray-500 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 cursor-pointer">
            Only {fmtPhone(via)} <span className="font-bold">×</span>
          </button>
        )}
      </div>

      {!!failedPhones.length && (
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">
          {failedPhones.map(fmtPhone).join(', ')}{' '}could not be read, so this list is{' '}
          <span className="font-semibold">incomplete</span>, not empty.
        </p>
      )}

      {loading ? <Spinner label="Reading the deal tickets…" />
        : failed ? <p className="text-[11px] text-blue-700 py-3 text-center">The deal tickets could not be read. Re-check to try again.</p>
        : !list.length ? <p className="text-[11px] text-gray-400 py-5 text-center">{ORDER_TABS.find((t) => t.key === tab)!.empty}</p>
        : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] min-w-[620px]">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                  <th className="text-left font-semibold px-1 py-1.5">Enquiry ID</th>
                  <th className="text-left font-semibold px-1 py-1.5">{tab === 'placed' ? 'Placed on' : 'Created'}</th>
                  <th className="text-right font-semibold px-1 py-1.5">Value</th>
                  <th className="text-left font-semibold px-1 py-1.5 pl-3">Status</th>
                  {showVia && <th className="text-left font-semibold px-1 py-1.5">Via</th>}
                  {showCompany && <th className="text-left font-semibold px-1 py-1.5">Company on order</th>}
                  {showGst && <th className="text-left font-semibold px-1 py-1.5">GST on order</th>}
                  <th className="text-left font-semibold px-1 py-1.5">Branch · SPOC</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const rowKey = r.enqId + r.contactNumber + (r.ticketId ?? '');
                  const expanded = openEnq === rowKey;
                  return (
                  <Fragment key={rowKey}>
                  <tr
                    onClick={() => setOpenEnq(expanded ? null : rowKey)}
                    className={`border-t border-gray-50 align-top cursor-pointer ${expanded ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-1 py-1.5"><EnqChip id={r.enqId} /></td>
                    <td className="px-1 py-1.5 text-gray-600 whitespace-nowrap">
                      {tab === 'placed'
                        ? (r.orderPlacedDate ? fmtDate(r.orderPlacedDate) : <span className="text-gray-400" title="Ordered, but the ticket carries no closure date">no closure date</span>)
                        : (fmtDate(r.createdAt) || <span className="text-gray-300">—</span>)}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono font-semibold text-gray-800 whitespace-nowrap">{fmtINR(r.orderValue)}</td>
                    <td className="px-1 py-1.5 pl-3">
                      <StatusChip r={r} />
                      {r.lostReason && <div className="text-[10px] text-gray-400 mt-0.5">{r.lostReason}</div>}
                    </td>
                    {showVia && <td className="px-1 py-1.5 font-mono text-[11px] text-gray-500 whitespace-nowrap">{fmtPhone(r.contactNumber)}</td>}
                    {showCompany && <td className="px-1 py-1.5 text-gray-600">{r.companyOnOrder || <span className="text-gray-300">—</span>}</td>}
                    {showGst && <td className="px-1 py-1.5 font-mono text-[11px] text-gray-600">{r.gstOnOrder || <span className="text-gray-300">—</span>}</td>}
                    <td className="px-1 py-1.5 text-gray-600">
                      {[r.branch, r.spoc].filter(Boolean).join(' · ') || <span className="text-gray-300">—</span>}
                      <span className="ml-1 text-gray-300">{expanded ? '▴' : '▾'}</span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5 + (showVia ? 1 : 0) + (showCompany ? 1 : 0) + (showGst ? 1 : 0)} className="px-1 pb-2">
                        <EnquiryDetail r={r} />
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

      {list.length > ORDER_PAGE_SIZE && (
        <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
          <span>Showing {(curPage - 1) * ORDER_PAGE_SIZE + 1}–{Math.min(curPage * ORDER_PAGE_SIZE, list.length)} of {list.length}</span>
          <div className="flex gap-2">
            <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1 rounded-md border border-gray-200 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
            <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1 rounded-md border border-gray-200 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-2">
        Matched to this firm by an exact contact-number match.
        {!!rejected && ` ${rejected} ticket${rejected === 1 ? '' : 's'} raised under a different number ${rejected === 1 ? 'was' : 'were'} discarded.`}
      </p>
    </SectionCard>
  );
}
