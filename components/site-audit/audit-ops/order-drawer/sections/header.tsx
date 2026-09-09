'use client';

import { AuditOrder } from '../../shared';
import { Chip } from '../ui/fields';

export function AuditDrawerHeader({ isPreBooking, o, onClose }: {
  isPreBooking: boolean;
  o: AuditOrder;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">{o.name || (o.status === 'slot_reserved' ? 'Pre-booked Slot' : '—')}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
          {o.pi} · {isPreBooking ? 'Store ' + ((o.log && o.log[0] && o.log[0].who) || o.bm) : 'BM ' + o.bm}
          <Chip st={o.status} />
        </div>
      </div>
      <button className="h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
    </div>
  );
}
