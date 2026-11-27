import { mdFetch } from '../core/client';

export async function fetchSiteAuditECs(leadIds: string[]): Promise<Record<string, string>> {
  if (!leadIds.length) return {};
  const data = await mdFetch('/site-audit-ec-branches/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_ids: leadIds }),
  });
  return (data && data.results) || {};
}

export interface StoreSlot {
  id: string;
  available: number;
  total: number;
  booked: number;
  buffer: number;
}

export interface StoreWindow {
  id: string;
  label: string;
  range_end: string;
  group: 'Morning' | 'Afternoon' | 'Evening';
  start_min: number;
  end_min: number;
}

export interface StoreSlotCalendar {
  label: string;
  days: Array<{ date: string; slots: StoreSlot[] }>;
  windows: StoreWindow[];
}

export async function fetchStoreSlots(store: string): Promise<StoreSlotCalendar> {
  const data = await mdFetch('/site-audit-store-slots/?store=' + encodeURIComponent(store));
  if (!data || !Array.isArray(data.days)) throw new Error('slot availability unavailable');
  return { label: data.label || store, days: data.days, windows: Array.isArray(data.windows) ? data.windows : [] };
}
