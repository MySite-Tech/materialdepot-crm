'use client';

import { fmtDate, fmtPhone } from '../utils';
import { fmtINR } from '../../../models/mock-data';
import { ClientOrderRow } from '@/lib/b2b';

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[12px] text-gray-800 break-words">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  );
}

export function EnquiryDetail({ r }: { r: ClientOrderRow }) {
  const cartTotal = r.cart.reduce((n, i) => n + (i.price && i.qty ? i.price * i.qty : i.price || 0), 0);
  const remarks = [...r.remarks].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const visits = [...r.visits].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Fact label="Cart value" value={fmtINR(r.orderValue)} />
        <Fact label="Excl. GST" value={r.cartValueExclGst !== undefined ? fmtINR(r.cartValueExclGst) : undefined} />
        <Fact label="Status" value={[r.status, r.lostReason].filter(Boolean).join(' · ')} />
        <Fact label="Raised on" value={fmtPhone(r.contactNumber) + (r.contactName ? ` · ${r.contactName}` : '')} />
        <Fact label="Created" value={fmtDate(r.createdAt)} />
        <Fact label="Follow-up" value={fmtDate(r.followUpDate)} />
        <Fact label="Closure date (set by hand on the deal)" value={fmtDate(r.closureDate)} />
        <Fact label="Marked lost" value={fmtDate(r.lostMarkDate)} />
        <Fact label="Branch" value={r.branch} />
        <Fact label="Assigned to" value={r.spoc} />
        <Fact label="Client type" value={r.clientType} />
        <Fact label="Property" value={[r.propertyType, r.projectPhase].filter(Boolean).join(' · ')} />
        <Fact label="Architect involved" value={r.architectInvolved === undefined ? undefined : r.architectInvolved ? 'Yes' : 'No'} />
        <Fact label="Ticket" value={r.ticketId ? `#${r.ticketId}` : undefined} />
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Cart</div>
        {r.cart.length ? (
          <ul className="bg-white border border-gray-100 rounded divide-y divide-gray-50">
            {r.cart.map((i, k) => (
              <li key={k} className="flex items-start justify-between gap-3 px-2 py-1 text-[12px]">
                <span className="text-gray-700 min-w-0 break-words">{i.name}</span>
                <span className="font-mono text-[11px] text-gray-500 whitespace-nowrap">
                  {[i.qty ? `× ${i.qty}` : '', i.price ? fmtINR(i.price) : ''].filter(Boolean).join('  ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-gray-400">The ticket lists no cart items.</p>
        )}
        {cartTotal > 0 && Math.round(cartTotal) !== Math.round(r.orderValue) && (
          <p className="text-[10px] text-gray-400 mt-1">Item prices add up to {fmtINR(cartTotal)}; the ticket&apos;s cart value is {fmtINR(r.orderValue)}.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Visits ({visits.length})</div>
          {visits.length ? (
            <ul className="text-[11px] text-gray-600 flex flex-col gap-0.5">
              {visits.map((v, k) => <li key={k}>{fmtDate(v.date)} · {v.channel || 'visit'}</li>)}
            </ul>
          ) : <p className="text-[11px] text-gray-400">None on the ticket.</p>}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Remarks ({remarks.length})</div>
          {remarks.length ? (
            <ul className="text-[11px] text-gray-600 flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {remarks.map((m, k) => (
                <li key={k}>
                  <span className="text-gray-400">{fmtDate(m.ts)}{m.author ? ` · ${m.author}` : ''}</span>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-[11px] text-gray-400">None on the ticket.</p>}
        </div>
      </div>
    </div>
  );
}
