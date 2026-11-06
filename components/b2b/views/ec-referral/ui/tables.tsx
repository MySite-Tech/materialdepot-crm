'use client';

import { useEffect, useState } from 'react';
import { fmtShortINR } from '../../../models/mock-data';
import { istDay } from '../../../models/outreach/reminders';
import { fmtDay } from '../../../ui/inbound-chips';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import type { ReferralSummary } from '@/lib/b2b/ec-referral/types';
import type { EcVisit } from '@/lib/b2b/ec-visits/types';
import type { OrdersState } from '../hooks/use-ec-referrals';
import { ordersCell, referralStage } from '../utils';
import { PAGE_SIZE, Pager } from './pager';

const th = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-3 py-2 align-top';

function usePage(total: number, resetKey: string) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const cur = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  return { page: cur, setPage, slice: <T,>(rows: T[]) => rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE) };
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h2 className="text-[12.5px] font-bold text-gray-800">{title}</h2>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function OrdersText({ r, orders }: { r: ReferralSummary; orders: OrdersState }) {
  const c = ordersCell(r, orders);
  if (c.state === 'loading') return <span className="text-gray-300">…</span>;
  if (c.state === 'unknown') return <span className="text-amber-700" title="Order history did not load for this number">Unknown</span>;
  if (!c.orders) return <span className="text-gray-400">No order yet</span>;
  return (
    <span>
      <b className="text-gray-900">{c.orders}</b> · {fmtShortINR(c.value)}
      {c.last && <span className="block text-[10.5px] text-gray-400">last {fmtDay(c.last)}</span>}
      {c.before && <span className="block text-[10.5px] text-amber-700" title="This number had ordered before it was referred, and those orders are in the total">ordered before the referral</span>}
    </span>
  );
}

export function ReferralTable({ title, sub, rows, orders, showBy, empty, resetKey }: {
  title: string;
  sub?: string;
  rows: ReferralSummary[];
  orders: OrdersState;
  showBy: boolean;
  empty: string;
  resetKey: string;
}) {
  const p = usePage(rows.length, resetKey);
  return (
    <Shell title={`${title} · ${rows.length}`} sub={sub}>
      {!rows.length ? <p className="px-4 py-3 text-[12px] text-gray-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead className="bg-gray-50"><tr>
              <th className={th}>Firm</th><th className={th}>EC</th><th className={th}>Referred</th>
              <th className={th}>Where it is</th><th className={th}>Orders on this number</th>
            </tr></thead>
            <tbody>
              {p.slice(rows).map((r) => (
                <tr key={r.id} className="border-t border-gray-50">
                  <td className={td}>
                    <div className="font-semibold text-gray-900">{r.company}</div>
                    <div className="text-[11px] text-gray-400">{[r.contactPerson, r.phone, r.companyType, r.city].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className={td}>{r.ec || '—'}</td>
                  <td className={td}>
                    {fmtDay(istDay(r.at))}
                    {showBy && r.by && <span className="block text-[11px] text-gray-400">by {r.by}</span>}
                  </td>
                  <td className={`${td} ${r.status === 'Closed' ? 'text-green-700 font-semibold' : r.status === 'Lost' ? 'text-gray-400' : 'text-gray-700'}`}>{referralStage(r)}</td>
                  <td className={td}><OrdersText r={r} orders={orders} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={p.page} total={rows.length} onPage={p.setPage} />
    </Shell>
  );
}

const STATUS_TONE: Record<string, string> = {
  Visited: 'text-green-700 font-semibold', Directed: 'text-sky-700', 'No show': 'text-amber-700', Cancelled: 'text-gray-400',
};

export function RedirectTable({ title, sub, rows, empty, resetKey }: {
  title: string;
  sub?: string;
  rows: EcVisit[];
  empty: string;
  resetKey: string;
}) {
  const p = usePage(rows.length, resetKey);
  return (
    <Shell title={`${title} · ${rows.length}`} sub={sub}>
      {!rows.length ? <p className="px-4 py-3 text-[12px] text-gray-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead className="bg-gray-50"><tr>
              <th className={th}>Client</th><th className={th}>Sent to</th><th className={th}>Sent by</th>
              <th className={th}>Why</th><th className={th}>Expected</th><th className={th}>Status</th><th className={th}>Orders at the EC</th>
            </tr></thead>
            <tbody>
              {p.slice(rows).map((v) => (
                <tr key={v.id} className="border-t border-gray-50">
                  <td className={td}>
                    <div className="font-semibold text-gray-900">{v.firm}</div>
                    <div className="text-[11px] text-gray-400">{[v.contactName, ...(v.phones.length ? v.phones : v.phone ? [v.phone] : [])].filter(Boolean).join(' · ')}</div>
                    {(v.enqId || v.leadRef) && <div className="text-[10.5px] font-mono text-gray-400">{v.enqId || v.leadRef}</div>}
                  </td>
                  <td className={td}>{v.branch}{v.bmName && <span className="block text-[11px] text-gray-400">BM {v.bmName}</span>}</td>
                  <td className={td}>
                    {v.scheduledBy || '—'}
                    <span className="block text-[11px] text-gray-400">
                      {[v.sourceTeam ? B2B_TEAM_LABEL[v.sourceTeam] : '', v.createdAt ? fmtDay(istDay(v.createdAt)) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className={`${td} max-w-[220px]`}>
                    {v.purpose || '—'}
                    {v.note && <span className="block text-[11px] text-gray-400 line-clamp-2">{v.note}</span>}
                  </td>
                  <td className={td}>{v.visitDate ? `${fmtDay(v.visitDate)}${v.visitTime ? `, ${v.visitTime}` : ''}` : <span className="text-gray-400">No date</span>}</td>
                  <td className={`${td} ${STATUS_TONE[v.status] ?? ''}`}>{v.status}</td>
                  <td className={td}>
                    {v.assisted
                      ? <span><b className="text-gray-900">{v.assisted.orders}</b> · {fmtShortINR(v.assisted.value)}<span className="block text-[10.5px] text-gray-400">checked {fmtDay(istDay(v.assisted.checkedAt))}</span></span>
                      : <span className="text-gray-400" title="B2B checks a redirect's orders from its EC Directed tab">Not checked yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={p.page} total={rows.length} onPage={p.setPage} />
    </Shell>
  );
}

export function Stats({ items }: { items: { label: string; value: string; sub?: string; warn?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
      {items.map((s) => (
        <div key={s.label} className="px-3 py-2.5 border-l border-gray-100 first:border-l-0 min-w-0">
          <div className="text-[11px] font-semibold text-gray-500 truncate">{s.label}</div>
          <div className="text-[20px] font-bold text-gray-900 tabular-nums leading-tight">{s.value}</div>
          {s.sub && <div className={`text-[10.5px] truncate ${s.warn ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
