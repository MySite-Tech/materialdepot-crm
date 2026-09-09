'use client';

import { useEffect, useState } from 'react';
import { fetchCRMLeads, type CRMLeadRow } from '@/lib/mockApi';
import { phoneKey } from '../siteAuditShared';

const LOST = new Set(['Refunded', 'Order Lost', 'Order Cancelled']);

const ORDERED = new Set(['Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered']);

function statusPill(status: string): string {
  if (LOST.has(status)) return 'bg-gray-100 text-gray-600';
  if (status === 'Delivered') return 'bg-green-100 text-green-700';
  if (ORDERED.has(status)) return 'bg-orange-100 text-orange-800';
  if (status === 'In Cart') return 'bg-indigo-100 text-indigo-700';
  return 'bg-amber-100 text-amber-800';
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function fmtDay(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(String(v).slice(0, 10) + 'T00:00');
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; deals: CRMLeadRow[] };

export default function ClientCarts({ phone, anchorDate, anchorLabel }: {
  phone: string;

  anchorDate: string | null;
  anchorLabel: string;
}) {
  const key = phoneKey(phone);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key || key.length !== 10) return;
    let alive = true;
    setState({ kind: 'loading' });
    fetchCRMLeads({ q: key, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' })
      .then(({ results }) => {
        if (!alive) return;

        setState({ kind: 'ok', deals: (results || []).filter((r) => phoneKey(r.clientPhone) === key) });
      })
      .catch((e: any) => {

        if (alive) setState({ kind: 'error', message: e?.message || 'the CRM did not answer' });
      });

    return () => { alive = false; };
  }, [key, nonce]);

  if (!key || key.length !== 10) {
    return (
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-500">
        No usable phone number on this order, so their carts can&apos;t be looked up. The CRM matches deals on the
        client&apos;s number and nothing else.
      </div>
    );
  }

  if (state.kind === 'loading') {
    return <div className="text-[12.5px] text-gray-400">Reading this client&apos;s carts from the CRM…</div>;
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
        <b>Couldn&apos;t read this client&apos;s carts</b> — {state.message}. That is unknown, not &ldquo;no carts&rdquo;:
        they may well have ordered. Everything else in this drawer is unaffected.
        <button onClick={() => setNonce((n) => n + 1)} className="ml-2 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">Try again</button>
      </div>
    );
  }

  const anchor = anchorDate ? String(anchorDate).slice(0, 10) : '';
  const dayOf = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');
  const since = anchor ? state.deals.filter((d) => dayOf(d.createdAt) >= anchor) : state.deals;
  const before = anchor ? state.deals.filter((d) => dayOf(d.createdAt) < anchor) : [];
  const total = state.deals.reduce((s, d) => s + (Number(d.cartValue) || 0), 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-semibold text-gray-700">
          {state.deals.length} deal{state.deals.length === 1 ? '' : 's'} on {phone}
        </span>
        {state.deals.length ? <span className="text-[12px] text-gray-400">· {inr(total)} total cart value</span> : null}
        <button onClick={() => setNonce((n) => n + 1)} className="ml-auto rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-gray-600">↻ Re-check</button>
      </div>

      {!state.deals.length ? (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
          This number has no deals in the CRM at all — not even the site audit&apos;s own. Worth checking whether the
          audit was booked against a different number before treating it as a client who never came back.
        </div>
      ) : (
        <>
          <DealTable
            rows={since}
            caption={anchor ? 'On or after this ' + anchorLabel : 'All deals on this number'}
            empty={'No deals raised on or after this ' + anchorLabel + '.'}
          />
          {before.length ? (
            <div className="mt-3">
              <DealTable
                rows={before}
                caption={'Earlier — before this ' + anchorLabel}
                empty=""
                muted
              />
              <div className="mt-1 text-[11.5px] text-gray-400">
                Shown as history only. An older deal is never this job&apos;s conversion — the same rule the follow-up
                buckets use.
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DealTable({ rows, caption, empty, muted }: { rows: CRMLeadRow[]; caption: string; empty: string; muted?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {caption}{rows.length ? ' · ' + rows.length : ''}
      </div>
      {!rows.length ? (
        <div className="text-[12.5px] text-gray-400">{empty}</div>
      ) : (
        <div className={`overflow-x-auto rounded-lg border border-gray-200 ${muted ? 'bg-gray-50/60' : 'bg-white'}`}>
          <table className="w-full min-w-[440px] border-collapse">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-2.5 py-1.5">Deal</th>
                <th className="px-2.5 py-1.5">Cart items</th>
                <th className="px-2.5 py-1.5">Status</th>
                <th className="px-2.5 py-1.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 align-top">
                  <td className="px-2.5 py-2">
                    <div className="font-mono text-[11.5px] font-semibold text-gray-800">{d.leadId || d.id}</div>
                    <div className="text-[11px] text-gray-400">{fmtDay(d.createdAt)}</div>
                  </td>
                  <td className="px-2.5 py-2 text-[12.5px] text-gray-700">
                    <div>{d.cartItems || '—'}</div>
                    {d.assignedTo || d.branch ? (
                      <div className="text-[11px] text-gray-400">{[d.assignedTo, d.branch].filter(Boolean).join(' · ')}</div>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${statusPill(String(d.status || ''))}`}>{d.status || '—'}</span>
                    {LOST.has(String(d.status || '')) && d.lostReason ? (
                      <div className="mt-0.5 text-[11px] text-gray-400">{d.lostReason}</div>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-[12px] text-gray-800">{d.cartValue ? inr(Number(d.cartValue)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
