import { SlotDef } from './types';
export const INSTALL_SKU = 'SVC-INSTALL-001';

export const FLOOR_DAY_CAP = 1;

export const WP_DAY_SLOTS = 3;

export const WALLPANEL_DAY_CAP = 1;

export const DEFAULT_SLOTS_FL: SlotDef[] = [
  { id: 'sf1', label: '9 AM – 12 PM' },
  { id: 'sf2', label: '12 PM – 3 PM' },
  { id: 'sf3', label: '3 PM – 6 PM' },
];

export const DEFAULT_SLOTS_WP: SlotDef[] = [
  { id: 'sw1', label: '8:00 AM – 11:00 AM' },
  { id: 'sw2', label: '11:00 AM – 2:00 PM' },
  { id: 'sw3', label: '2:00 PM – 5:00 PM' },
];

export const today = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now.getTime() !== today.getTime()) today.setTime(now.getTime());
  }, 60000);
}

export const STATUS: Record<string, { l: string; badge: string }> = {
  pending: { l: 'Pending', badge: 'bg-gray-100 text-gray-600' },
  deliv_ontime: { l: 'Delivery on time', badge: 'bg-green-100 text-green-700' },
  deliv_delayed: { l: 'Delivery Delayed', badge: 'bg-red-100 text-red-700' },
  created: { l: 'Service Created', badge: 'bg-purple-100 text-purple-700' },
  call_na: { l: 'Call not picked', badge: 'bg-red-100 text-red-700' },
  scheduled: { l: 'Site Installation Scheduled', badge: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Site Installer Assigned', badge: 'bg-amber-100 text-amber-700' },
  callpending: { l: 'Call Pending (Installer)', badge: 'bg-amber-100 text-amber-700' },
  reschedule: { l: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', badge: 'bg-blue-100 text-blue-700' },
  atsite: { l: 'At Site', badge: 'bg-indigo-100 text-indigo-700' },
  partial: { l: 'Partially Completed', badge: 'bg-teal-100 text-teal-700' },
  completed: { l: 'Site Installation Completed', badge: 'bg-green-100 text-green-700' },
};

export const AUTO_STATUSES = ['onway', 'atsite', 'completed'];

export const LS_KEY_FL = 'md_install_slots_fl';

export const LS_KEY_WP = 'md_install_slots_wp';
