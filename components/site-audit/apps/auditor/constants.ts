'use client';

export const AUDITOR_COLS =
  'id,pi,po,skus,bm,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,log';

export const SLOTS: Record<string, { label: string; start: number }> = {
  s1: { label: '9 AM – 12 PM', start: 9 },
  s2: { label: '12 PM – 3 PM', start: 12 },
  s3: { label: '3 PM – 6 PM', start: 15 },
  sf1: { label: '9 AM – 12 PM', start: 9 },
  sf2: { label: '12 PM – 3 PM', start: 12 },
  sf3: { label: '3 PM – 6 PM', start: 15 },
  sw1: { label: '9 AM – 12 PM', start: 9 },
  sw2: { label: '12 PM – 3 PM', start: 12 },
  sw3: { label: '3 PM – 6 PM', start: 15 },
};

export const STATUS_LABELS: Record<string, { l: string; chip: string }> = {
  scheduled: { l: 'Scheduled', chip: 'bg-indigo-100 text-indigo-700' },
  callpending: { l: 'Call Pending', chip: 'bg-indigo-100 text-indigo-700' },
  reschedule: { l: 'To Reschedule', chip: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', chip: 'bg-blue-100 text-blue-700' },
  atsite: { l: 'At Site', chip: 'bg-blue-100 text-blue-700' },
  completed: { l: 'Site Audit Completed', chip: 'bg-green-100 text-green-700' },
};

export const AUDITOR_STAGES = ['scheduled', 'callpending', 'reschedule', 'onway', 'atsite', 'completed'];

export const DEFAULT_LOG_TEXT: Record<string, string> = {
  callpending: 'Pre-visit call started',
  onway: 'Auditor on the way · customer confirmed',
  reschedule: 'Customer declined → sent to SM to reschedule',
  atsite: 'Auditor arrived at site',
  completed: 'Site audit completed',
};

export const GROUP_LABEL_CLS = 'mt-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-400';
