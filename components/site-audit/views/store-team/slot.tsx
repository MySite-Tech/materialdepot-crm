'use client';

import { fmtDate } from '../../install-ops/utils';


import { SLOT_DEFS } from './constants';
import { SlotContentProps } from './types';
import { fmtSlotId, getAvailability, morningCutoffHit } from './utils';

export function SlotContent({
  date,
  myStore,
  dayOrders,
  auditorCount,
  capBlocked,
  storeCity,
  myRes,
  allBooked,
  nowMin,
  isMyBooking,
  cancellingId,
  onBook,
  onCancel,
}: SlotContentProps) {
  const anyContent = myRes.length || allBooked.length;
  return (
    <div className="flex flex-col gap-6">
      {(['Morning', 'Afternoon', 'Evening'] as const).map((grp) => {
        const cutMorning = grp === 'Morning' && morningCutoffHit(date);
        const slots = cutMorning ? [] : SLOT_DEFS.filter((s) => s.group === grp && (nowMin === null || s.startMin > nowMin));
        return (
          <div key={grp}>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
              {grp}
            </div>
            {!slots.length ? (
              <div className="text-[13px] text-gray-400 px-1">
                {cutMorning
                  ? 'Morning slots for tomorrow close at 6:00 PM. Please pick an afternoon/evening slot, or a morning slot on a later day.'
                  : 'No upcoming slots'}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                {slots.map((sl) => {
                  const av = getAvailability(sl.id, dayOrders, auditorCount, capBlocked);
                  const isFull = av.available <= 0;
                  const myBookingsForSlot = myRes.filter((r) => r.slot === sl.id);
                  const hasMyBooking = myBookingsForSlot.length > 0;
                  const dotClass = isFull ? 'bg-red-500' : av.available === 1 ? 'bg-amber-500' : 'bg-green-500';

                  let availText: string;
                  if (av.total === 0) {

                    availText = `No ${storeCity} auditors are working this day`;
                  } else if (isFull && !hasMyBooking) {
                    availText = `Full — all ${av.total} ${storeCity} auditor${av.total !== 1 ? 's' : ''} booked`;
                  } else {
                    availText = `${av.available} of ${av.total} ${storeCity} auditor${av.total !== 1 ? 's' : ''} available`;
                  }

                  const otherResForSlot = dayOrders.filter(
                    (o) => o.status === 'slot_reserved' && !isMyBooking(o) && o.slot === sl.id
                  );
                  const bookable = !isFull;

                  return (
                    <div
                      key={sl.id}
                      onClick={bookable ? () => onBook(sl.id) : undefined}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        bookable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-70'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px]">
                          <span className="font-semibold text-black">{sl.label}</span>{' '}
                          <span className="text-gray-400">– {sl.rangeEnd}</span>
                        </div>
                        <div className="text-[12px] text-gray-500">{availText}</div>
                        {myBookingsForSlot.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {myBookingsForSlot.map((r) => (
                              <span
                                key={r.id}
                                className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"
                              >
                                ✓ {r.customer_name || 'Booking'}
                              </span>
                            ))}
                          </div>
                        )}
                        {otherResForSlot.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {otherResForSlot.map((r) => (
                              <span key={r.id} className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                                {(r.log && r.log[0] && r.log[0].who) || r.bm || 'Other store'} pre-booked
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!isFull ? (
                        <button
                          className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBook(sl.id);
                          }}
                        >
                          Book
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-red-600 shrink-0">Full</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {myRes.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
            Pre-bookings from {myStore} · {fmtDate(date)}
          </div>
          <div className="flex flex-col gap-3">
            {myRes.map((r) => {
              const cats = Array.isArray(r.audit_ticked) ? r.audit_ticked.filter(Boolean) : [];
              const bookingBm = r.bm && r.bm !== myStore ? r.bm : null;
              return (
                <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-md px-2 py-1">
                      {fmtSlotId(r.slot)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-black">{r.customer_name || '—'}</div>
                      <div className="text-[12px] text-gray-500">
                        {r.phone || '—'}
                        {bookingBm ? ' · BM: ' + bookingBm : ''}
                      </div>
                      {r.po && <div className="text-[11.5px] text-gray-400 mt-0.5">ENQ: {r.po}</div>}
                    </div>
                  </div>
                  {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {cats.map((c: string, i: number) => (
                        <span key={i} className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <span className="text-[12px] text-gray-400 flex-1">Booking ID: {r.pi}</span>
                    <button
                      disabled={cancellingId === r.id}
                      onClick={() => onCancel(r.id)}
                      className="bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allBooked.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
            All confirmed bookings · {fmtDate(date)}
          </div>
          <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 mb-3">
            These are already-assigned audit visits on this date. They are accounted for in the slot availability above.
          </div>
          <div className="flex flex-col gap-3">
            {allBooked.map((o) => (
              <div key={o.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border border-gray-100 rounded-md px-2 py-1">
                    {fmtSlotId(o.slot)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-black">{o.customer_name || o.pi || '—'}</div>
                    <div className="text-[12px] text-gray-500">
                      {o.pi} · {(o.status || '').replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!anyContent && (
        <div className="text-center py-8 text-gray-400 text-[13px]">No bookings for this date yet.</div>
      )}
    </div>
  );
}
