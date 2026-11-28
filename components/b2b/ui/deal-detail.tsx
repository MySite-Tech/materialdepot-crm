'use client';

import type { ClientOrderRow } from '@/lib/b2b';
import { fmtINR } from '../models/mock-data';
import type { SkuLine } from '@/lib/b2b/ticket-skus/types';
import { useEnquiryDetail } from '../hooks/use-enquiry-detail';
import { useTicketSkus } from '../hooks/use-ticket-skus';
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

function Facts({ items }: { items: [string, string | undefined][] }) {
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[12px]">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-gray-400">{label}</dt>
          <dd className="text-gray-800 truncate" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const skuLine = (i: SkuLine) => ({
  name: i.name,
  sub: [i.sku, i.brand, i.category].filter(Boolean).join(' · '),
  qty: i.qty ? `${i.qty}${i.unit ? ` ${i.unit}` : ''}` : '',
  rate: i.rate ?? undefined,
  total: i.total ?? undefined,
});

function Items({ row, skus }: { row: ClientOrderRow; skus?: SkuLine[] }) {
  const boq = row.items ?? [];
  const lines = skus?.length
    ? skus.map(skuLine)
    : boq.length
      ? boq.map((i) => ({ name: i.name, sub: '', qty: i.qty ? `${i.qty}${i.unit ? ` ${i.unit}` : ''}` : '', rate: i.rate, total: i.total ?? (i.qty && i.rate ? i.qty * i.rate : undefined) }))
      : row.cart.map((i) => ({ name: i.name, sub: '', qty: i.qty ? String(i.qty) : '', rate: i.price, total: i.qty && i.price ? i.qty * i.price : undefined }));
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
              <td className={`${td} text-gray-800`}>
                {l.name}
                {l.sub && <div className="text-[11px] text-gray-400 font-mono">{l.sub}</div>}
              </td>
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
  const skus = useTicketSkus(row.enqId, row.contactNumber, kind === 'Cart' || kind === 'PI');
  const remarks = [...row.remarks].reverse();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${TONE[kind]}`}>{kind}</span>
          <span className="text-[12.5px] text-gray-700">{row.status}</span>
          <span className="text-[11.5px] text-gray-400 truncate">{[row.branch, row.spoc, row.createdAt && `opened ${fmtDay(row.createdAt)}`].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="text-right tabular-nums">
          <span className="text-[15px] font-semibold text-gray-900">{fmtINR(row.orderValue)}</span>
          {row.cartValueExclGst !== undefined && <span className="text-[11.5px] text-gray-500 ml-2">{fmtINR(row.cartValueExclGst)} before GST</span>}
        </div>
      </div>

      <section className="flex flex-col gap-1.5">
        {skus.status === 'loading' && <Spinner label="Reading product codes…" />}
        {skus.status === 'failed' && <p className="text-[11.5px] text-amber-700">Product codes could not be read ({skus.error}), so these are the lines Django holds.</p>}
        <Items row={row} skus={skus.status === 'ready' && skus.skus.status === 'found' ? skus.skus.lines : undefined} />
      </section>

      <Facts
        items={[
          ['Client on the ticket', row.contactName],
          ['Number', row.contactNumber],
          ['GST on the ticket', row.gstOnOrder],
          ['Follow-up (store)', row.followUpDate ? fmtDay(row.followUpDate) : undefined],
          [row.ordered ? 'Order placed' : row.lost ? 'Closed on' : 'Expected closure', row.placedAt ? fmtLeadDateTime(row.placedAt) : (row.lostMarkDate || row.closureDate) ? fmtDay(row.lostMarkDate || row.closureDate) : undefined],
          ['Property / phase', [row.propertyType, row.projectPhase].filter(Boolean).join(' · ') || undefined],
        ]}
      />
      {row.lostReason && <p className="text-[12px] text-red-600">Lost reason: {row.lostReason}</p>}

      {(remarks.length > 0 || row.visits.length > 0) && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-[12.5px] font-semibold text-gray-900">Store remarks and visits</h4>
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
    <div className="bg-gray-50 border border-gray-100 rounded-md px-3 py-2.5 cursor-default flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
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
