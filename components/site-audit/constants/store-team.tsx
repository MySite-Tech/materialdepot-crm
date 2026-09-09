'use client';

import { SlotDef } from '../types/store-team';

export const STORES = ['JP Nagar', 'Whitefield', 'Yelahanka', 'Gachibowli', 'Kompally', 'HSR Layout'];

export const STORE_CITY: Record<string, string> = {
  'JP Nagar': 'Bengaluru',
  Whitefield: 'Bengaluru',
  Yelahanka: 'Bengaluru',
  'HSR Layout': 'Bengaluru',
  Gachibowli: 'Hyderabad',
  Kompally: 'Hyderabad',
};

export const SLOT_DEFS: SlotDef[] = [
  { id: '10:00', label: '10:00 AM', rangeEnd: '11:00 AM', startMin: 600, endMin: 660, group: 'Morning' },
  { id: '11:00', label: '11:00 AM', rangeEnd: '12:00 PM', startMin: 660, endMin: 720, group: 'Morning' },
  { id: '13:00', label: '1:00 PM', rangeEnd: '2:00 PM', startMin: 780, endMin: 840, group: 'Afternoon' },
  { id: '14:00', label: '2:00 PM', rangeEnd: '3:00 PM', startMin: 840, endMin: 900, group: 'Afternoon' },
  { id: '16:00', label: '4:00 PM', rangeEnd: '5:00 PM', startMin: 960, endMin: 1020, group: 'Evening' },
  { id: '17:00', label: '5:00 PM', rangeEnd: '6:00 PM', startMin: 1020, endMin: 1080, group: 'Evening' },
];

export const ASSIGNED_STATUSES = ['assigned', 'scheduled', 'callpending', 'onway', 'atsite', 'completed'];

export const MORNING_CUTOFF_MIN = 18 * 60;

export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
