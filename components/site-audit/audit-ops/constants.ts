import { SlotDef } from './types';

const PRE_CARD_STATUSES = [
  'slot_reserved', 'slot_converted', 'pending', 'created', 'call_na',
  'scheduled', 'assigned', 'callpending', 'reschedule',
];
export const AUDIT_SKU = 'SVC-AUDIT-001';

export const AUDIT_COLS =
  'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,shadower_email,shadower_name,log,created_by_email,city';

export const STATUS: Record<string, { l: string; badge: string }> = {
  slot_reserved: { l: 'Pre-booked (Store)', badge: 'bg-sky-100 text-sky-800' },
  slot_converted: { l: 'Pre-booking Fulfilled', badge: 'bg-green-100 text-green-700' },
  pending: { l: 'Pending', badge: 'bg-gray-100 text-gray-600' },
  created: { l: 'Service Created', badge: 'bg-sky-100 text-sky-700' },
  call_na: { l: 'Call not picked', badge: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Audit Scheduled', badge: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Auditor Assigned', badge: 'bg-purple-100 text-purple-700' },
  callpending: { l: 'Call Pending (Auditor)', badge: 'bg-purple-100 text-purple-700' },
  reschedule: { l: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', badge: 'bg-amber-100 text-amber-700' },
  atsite: { l: 'At Site', badge: 'bg-amber-100 text-amber-700' },
  completed: { l: 'Site Audit Completed', badge: 'bg-green-100 text-green-700' },
};

export const AUTO_STATUSES = ['onway', 'atsite', 'completed'];

export const FLOW = ['pending', 'created', 'scheduled', 'assigned', 'completed'];

export const FLOW_LABELS = ['Pending', 'Service created', 'Scheduled', 'Auditor assigned', 'Completed'];

export const DEFAULT_AUDIT_SLOTS_FL: SlotDef[] = [
  { id: 'sf1', label: '9 AM – 12 PM' },
  { id: 'sf2', label: '12 PM – 3 PM' },
  { id: 'sf3', label: '3 PM – 6 PM' },
];

export const DEFAULT_AUDIT_SLOTS_WP: SlotDef[] = [
  { id: 'sw1', label: '9 AM – 12 PM' },
  { id: 'sw2', label: '12 PM – 3 PM' },
  { id: 'sw3', label: '3 PM – 6 PM' },
];

export const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
if (typeof window !== 'undefined') {

  setInterval(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now.getTime() !== today.getTime()) today.setTime(now.getTime());
  }, 60000);
}

export const DEFAULT_CAP = 3;

export const AUDIT_CATEGORY_QUERY =
  'audit_orders?select=id,pi,po,status,audit_ticked&status=in.(' + PRE_CARD_STATUSES.join(',') + ')';

export const TH = 'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap';

export const TD = 'px-3 py-2.5 text-[13px] align-top border-t border-gray-100';

export const CONFLICT_STATUSES = ['scheduled', 'assigned', 'callpending', 'onway', 'atsite', 'slot_reserved'];

export const FOLLOWUP_ACTIVE_STATUSES = ['created', 'call_na', 'reschedule'];

