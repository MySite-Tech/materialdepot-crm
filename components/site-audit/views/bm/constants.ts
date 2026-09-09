'use client';

export const AUDIT_COLS = 'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_name,log,created_at,bm_journey,coe_track';

export const STATUS: Record<string, { l: string; c: string }> = {
  slot_reserved: { l: 'Pre-booked (Store)', c: 'bg-sky-100 text-sky-800' },
  slot_converted: { l: 'Pre-booking Fulfilled', c: 'bg-green-100 text-green-700' },
  pending: { l: 'Pending', c: 'bg-gray-100 text-gray-600' },
  created: { l: 'Service Created', c: 'bg-sky-100 text-sky-700' },
  call_na: { l: 'Call not picked', c: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Audit Scheduled', c: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Auditor Assigned', c: 'bg-purple-100 text-purple-700' },
  callpending: { l: 'Call Pending (Auditor)', c: 'bg-purple-100 text-purple-700' },
  reschedule: { l: 'To Reschedule', c: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', c: 'bg-amber-100 text-amber-700' },
  atsite: { l: 'At Site', c: 'bg-amber-100 text-amber-700' },
  completed: { l: 'Site Audit Completed', c: 'bg-green-100 text-green-700' },
};
