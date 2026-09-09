'use client';

import { AuditOrder } from '../../types';

export function AuditDrawerActions({ assignAuditor, bookDate, bookSlot, bookTime, busy, cancelReservation, createService, delOrder, markPreBookingFulfilled, o, onClose, onRaiseRect, pickedAuditor, saveReschedFollowUp, setStatus }: {
  assignAuditor: () => Promise<void>;
  bookDate: string;
  bookSlot: () => Promise<void>;
  bookTime: string;
  busy: boolean;
  cancelReservation: () => Promise<void>;
  createService: () => Promise<void>;
  delOrder: () => Promise<void>;
  markPreBookingFulfilled: () => Promise<void>;
  o: AuditOrder;
  onClose: () => void;
  onRaiseRect: (o: AuditOrder) => void;
  pickedAuditor: string | null;
  saveReschedFollowUp: () => Promise<void>;
  setStatus: (st: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-white px-5 py-3.5">
      {o.status === 'slot_reserved' ? (
        <>
          <button disabled={busy} onClick={cancelReservation} className="rounded-md border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-600">Cancel Reservation</button>
          <button disabled={busy} onClick={markPreBookingFulfilled} className="rounded-md bg-green-600 px-3.5 py-2 text-[13px] font-semibold text-white">✓ Service Created</button>
          <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
        </>
      ) : o.status === 'slot_converted' ? (
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
      ) : (
        <>
          <button disabled={busy} onClick={delOrder} className="rounded-md border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-600">🗑 Delete</button>
          <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Close</button>
          {o.status === 'pending' ? (
            <button disabled={busy} onClick={createService} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white">Create service</button>
          ) : null}
          {['created', 'call_na'].includes(o.status) ? (
            <button disabled={busy || !bookDate || !bookTime} onClick={bookSlot} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Book slot</button>
          ) : null}
          {o.status === 'scheduled' ? (
            <button disabled={busy || !pickedAuditor} onClick={assignAuditor} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Assign auditor</button>
          ) : null}
          {o.status === 'reschedule' ? (
            <>
              <button disabled={busy} onClick={saveReschedFollowUp} className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700">Save follow-up</button>
              <button disabled={busy || !bookDate || !bookTime} onClick={bookSlot} className="rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Rebook slot</button>
            </>
          ) : null}
          {o.status === 'atsite' ? (
            <button disabled={busy} onClick={() => setStatus('completed')} className="rounded-md bg-green-600 px-3.5 py-2 text-[13px] font-semibold text-white">Mark Completed</button>
          ) : null}
          {o.status === 'completed' ? (
            o.service?.rectification_raised
              ? <span className="flex-1 rounded-md bg-amber-100 px-3.5 py-2 text-center text-[13px] font-semibold text-amber-700">↩ Rectified</span>
              : <button onClick={() => onRaiseRect(o)} className="rounded-md bg-amber-600 px-3.5 py-2 text-[13px] font-semibold text-white">↩ Raise Rectification</button>
          ) : null}
        </>
      )}
    </div>
  );
}
