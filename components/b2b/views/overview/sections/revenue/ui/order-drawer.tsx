'use client';

import { EnquiryDetail } from '../../../../../drawers/firm/cards/enquiry';
import { fmtDate, fmtPhone } from '../../../../../drawers/firm/utils';
import { dealIsOrder } from '../../../../../models/client';
import { fmtINR, fmtL } from '../../../../../models/mock-data';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import { RevenueOrder, channelSplits, isCounted } from '@/lib/b2b/revenue';
import { useEffect, useMemo, useState } from 'react';
import { BUCKET_LABELS, BUCKET_REASON, CHANNEL_META, EC_REASON } from '../constants';

const reasonOf = (o: RevenueOrder): string =>
  o.bucket === 'ec' ? (o.heldBy && EC_REASON[o.heldBy]) || CHANNEL_META.ec.hint : BUCKET_REASON[o.bucket];

function OrderRow({ o, startOpen }: { o: RevenueOrder; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const items = o.ticket.cart.map((c) => c.name);
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-left px-3 py-2.5 cursor-pointer hover:bg-teal-50/40 rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-mono text-[12px] font-semibold text-[#0F766E]">{o.id}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
              {o.bucket in CHANNEL_META && <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_META[o.bucket as keyof typeof CHANNEL_META].color }} />}
              {BUCKET_LABELS[o.bucket]}
            </span>
            <span className="text-[11px] text-gray-500">{o.status}</span>
          </div>
          <span className="tabular-nums text-[13px] font-semibold text-gray-900 whitespace-nowrap">{fmtINR(o.value)}</span>
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          {[fmtDate(o.day), o.client, o.phone && fmtPhone(o.phone), o.person && `Credited to ${o.person}${o.team ? ` (${B2B_TEAM_LABEL[o.team]})` : ''}`, o.placedBy && `On the cart ${o.placedBy}`, o.store].filter(Boolean).join(' · ')}
        </div>
        {!!items.length && (
          <div className="text-[11px] text-gray-400 mt-0.5 truncate">{items.length} item{items.length === 1 ? '' : 's'}: {items.join(', ')}</div>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <p className="text-[11px] text-gray-600">
            {!dealIsOrder(o.status) && <span className="font-semibold">{o.status || 'This status'} is not an order yet, so this is not in B2B revenue. Once placed it would count this way. </span>}
            <span className="font-semibold">Why {BUCKET_LABELS[o.bucket]}:</span> {reasonOf(o)}
            {o.bookedOnB2B ? ' Booked on the B2B branch.' : ' Booked at a store.'}
          </p>
          <EnquiryDetail r={o.ticket} />
        </div>
      )}
    </div>
  );
}

export function OrderDrawer({ title, orders, note, onClose }: {
  title: string;
  note?: React.ReactNode;
  orders: RevenueOrder[];
  onClose: () => void;
}) {
  const splits = useMemo(() => channelSplits(orders.filter((o) => dealIsOrder(o.status))), [orders]);
  const notOrders = orders.filter((o) => !dealIsOrder(o.status)).length;
  const total = useMemo(() => orders.reduce((s, o) => s + o.value, 0), [orders]);
  const counted = orders.filter((o) => isCounted(o) && dealIsOrder(o.status)).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1150] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[820px] max-w-full bg-gray-50 h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold text-gray-900 truncate">{title}</h2>
              <div className="text-[12px] text-gray-500 mt-1 tabular-nums">
                {orders.length} order{orders.length === 1 ? '' : 's'} · {fmtL(total)}
                {counted < orders.length && ` · ${orders.length - counted} not in B2B revenue${notOrders ? ` (${notOrders} not orders yet)` : ''}`}
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-1.5">
                {(Object.keys(CHANNEL_META) as (keyof typeof CHANNEL_META)[]).filter((c) => splits[c].orders > 0).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 tabular-nums">
                    <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_META[c].color }} />
                    {CHANNEL_META[c].label} {fmtL(splits[c].value)} · {splits[c].orders}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none cursor-pointer" aria-label="Close">×</button>
          </div>
        </div>
        <div className="px-6 py-5 flex flex-col gap-2">
          {note}
          {!orders.length && <p className="text-[12px] text-gray-400">No orders here.</p>}
          {orders.map((o) => <OrderRow key={o.id} o={o} startOpen={orders.length === 1} />)}
        </div>
      </div>
    </div>
  );
}
