import type { StorePool, WindowRow } from './types';

export const STORE_WINDOWS_SETTING = 'audit_store_slots';

export const STORE_POOLS: StorePool[] = [
  { id: 'jp-nagar', label: 'JP Nagar', city: 'Bengaluru' },
  { id: 'electronic-city', label: 'Electronic City', city: 'Bengaluru' },
  { id: 'yelahanka', label: 'Yelahanka + Basaveshwara Nagar', city: 'Bengaluru' },
  { id: 'hsr-layout', label: 'HSR Layout', city: 'Bengaluru' },
  { id: 'whitefield', label: 'Whitefield', city: 'Bengaluru' },
  { id: 'gachibowli', label: 'Gachibowli', city: 'Hyderabad' },
  { id: 'kompally', label: 'Kompally', city: 'Hyderabad' },
];

export const STANDARD_WINDOWS: WindowRow[] = [
  { start: '10:00', end: '11:00' },
  { start: '11:00', end: '12:00' },
  { start: '13:00', end: '14:00' },
  { start: '14:00', end: '15:00' },
  { start: '16:00', end: '17:00' },
  { start: '17:00', end: '18:00' },
];
