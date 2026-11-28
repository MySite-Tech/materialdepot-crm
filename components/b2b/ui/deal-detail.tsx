'use client';

import type { ClientOrderRow } from '@/lib/b2b';
import { fmtINR } from '../models/mock-data';
import { useEnquiryDetail } from '../hooks/use-enquiry-detail';
import { Spinner, fmtDay, fmtLeadDateTime } from './inbound-chips';

const OPEN_PI = ['Quote Approval Pending', 'Availability Check', 'Hold Stock'];

const kindOf = (r: ClientOrderRow) =>
  r.ordered ? 'Order' : r.lost ? 'Closed' : r.status === 'In Cart' ? 'Cart' : OPEN_PI.includes(r.status) ? 'PI' : 'Enquiry';

const TONE: Record<string, string> = {
  Cart: 'bg-indigo-50 text-indigo-700',
  PI: 'bg-purple-50 text-purple-700',
  Order: 'bg-emerald-50 text-emerald-700',
  Closed: 'bg-gray-100 text-gray-600',
  Enquiry: 'bg-gray-100 text-gray-600',
};

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-gray-500">{label}</div>
      <div className={`text-[12.5px] truncate ${value ? 'text-gray-900' : 'text-gray-300'}`} title={value}>{value || '—'}</div>
    </div>
  );
}

function Items({ row }: { row: ClientOrderRow }) {
  const boq = row.items ?? [];
  const lines = boq.length
    ? boq.map((i) => ({ name: i.name, qty: i.qty ? `${i.qty}${i.unit ? ` ${i.unit}` : ''}` : '', rate: i.rate, total: i.total ?? (i.qty && i.rate ? i.qty * i.rate : undefined) }))
    : row.cart.map((i) => ({ name: i.name, qty: i.qty ? String(i.qty) : '', rate: i.price, total: i.qty && i.price ? i.qty * i.price : undefined }));
  if (!lines.length) return <p className="text-[12px] text-gray-400">Django sent no line items for this ticket.</p>;
  const sum = lines.reduce((a, l) => a + (l.total ?? 0), 0);
  const td = 'py-1.5 px-2 align-top';
  return (
    <div className="border border-gray-100 rounded-md overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50 text-[11.5px] text-gray-500 text-left">
            <th className={`${td} font-medium`}>Product</th>
            <th className={`${td} font-medium text-right`}>Qty</th>
            <th className={`${td} font-medium text-right`}>Rate</th>
            <th className={`${td} font-medium text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className={`${td} text-gray-800`}>{l.name}</td>
              <td className={`${td} text-right text-gray-600 whitespace-nowrap`}>{l.qty || '—'}</td>
              <td className={`${td} text-right font-mono text-gray-600 whitespace-nowrap`}>{l.rate ? fmtINR(l.rate) : '—'}</td>
              <td className={`${td} text-right font-mono text-gray-800 whitespace-nowrap`}>{l.total ? fmtINR(l.total) : '—'}</td>
            </tr>
          ))}
        </tbody>
        {sum > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className={`${td} text-gray-500`} colSpan={3}>{lines.length} item{lines.length === 1 ? '' : 's'}</td>
              <td className={`${td} text-right font-mono font-medium text-gray-900 whitespace-nowrap`}>{fmtINR(sum)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Body({ row }: { row: ClientOrderRow }) {
  const kind = kindOf(row);
  const remarks = [...row.remarks].reverse();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${TONE[kind]}`}>{kind}</span>
          <span className="text-[12.5px] text-gray-700">{row.status}</span>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-semibold text-gray-900 tabular-nums">{fmtINR(row.orderValue)}</div>
          {row.cartValueExclGst !== undefined && <div className="text-[11.5px] text-gray-500 tabular-nums">{fmtINR(row.cartValueExclGst)} before GST</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
        <Fact label="Client on the ticket" value={row.contactName} />
        <Fact label="Number" value={row.contactNumber} />
        <Fact label="GST on the ticket" value={row.gstOnOrder} />
        <Fact label="Store" value={row.branch} />
        <Fact label="Store BM" value={row.spoc} />
        <Fact label="Opened" value={row.createdAt ? fmtDay(row.createdAt) : undefined} />
        <Fact label="Follow-up (store)" value={row.followUpDate ? fmtDay(row.followUpDate) : undefined} />
        <Fact label={row.ordered ? 'Order placed' : row.lost ? 'Closed on' : 'Expected closure'} value={row.placedAt ? fmtLeadDateTime(row.placedAt) : (row.lostMarkDate || row.closureDate) ? fmtDay(row.lostMarkDate || row.closureDate) : undefined} />
        <Fact label="Property / phase" value={[row.propertyType, row.projectPhase].filter(Boolean).join(' · ') || undefined} />
      </div>
      {row.lostReason && <p className="text-[12px] text-red-600">Lost reason: {row.lostReason}</p>}

      <section className="flex flex-col gap-1.5">
        <h4 className="text-[13px] font-semibold text-gray-900">Products</h4>
        <Items row={row} />
      </section>

      {(remarks.length > 0 || row.visits.length > 0) && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-[13px] font-semibold text-gray-900">Store remarks and visits</h4>
          {row.visits.length > 0 && (
            <p className="text-[12px] text-gray-600">Visits: {row.visits.map((v) => `${fmtDay(v.date)}${v.channel ? ` (${v.channel})` : ''}`).join(', ')}</p>
          )}
          <ul className="flex flex-col divide-y divide-gray-100">
            {remarks.map((r, i) => (
              <li key={i} className="py-1.5">
                <p className="text-[12px] text-gray-800 whitespace-pre-wrap">{r.text}</p>
                <p className="text-[11px] text-gray-400">{[r.author, r.ts && fmtLeadDateTime(r.ts)].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function DealInline({ enqId, fallback, actions }: { enqId: string; fallback?: ClientOrderRow; actions?: React.ReactNode }) {
  const state = useEnquiryDetail(enqId);
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md px-3 py-3 cursor-default flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
      {actions}
      {state.status === 'loading' ? <Spinner label="Reading the deal ticket…" />
        : state.status === 'ready' ? <Body row={state.row} />
          : fallback ? (
            <>
              <p className="text-[11.5px] text-amber-700">
                {state.status === 'failed' ? `The full ticket could not be read (${state.error}), so this is what the order list holds.` : 'Django has no deal ticket with this id, so this is what the order list holds.'}
              </p>
              <Body row={fallback} />
            </>
          ) : state.status === 'failed' ? <p className="text-[12.5px] text-amber-700">The deal ticket could not be read ({state.error}). Nothing here means it is empty.</p>
            : <p className="text-[12.5px] text-gray-500">Django has no ticket with this id any more.</p>}
    </div>
  );
}
