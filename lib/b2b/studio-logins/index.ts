import { b2bBackendGet, b2bBackendPost } from '../data/backend';
import type { StudioFirm, StudioLogin, StudioLogins } from '@/components/b2b/models/client';

const TTL_MS = 60_000;

interface LoginRow {
  phone: string;
  firm_name: string | null;
  role: string;
  visible_tabs: string[] | null;
  power: boolean;
}

interface FirmRow {
  partner_id: string;
  firm_name: string;
  phones: string[];
  gsts: string[];
  logins: number;
  power: boolean;
  orders: { enq_id: string; phone: string | null; source: string; value: number; ordered_on: string | null; status: string | null }[];
  referrals: { name: string; phone: string; status: string; referred_on: string | null; orders: number; value: number }[];
}

export interface StudioAccessData {
  logins: StudioLogins;
  firms: StudioFirm[];
}

let cached: { at: number; promise: Promise<StudioAccessData> } | null = null;

export function fetchStudioAccess(): Promise<StudioAccessData> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = b2bBackendGet<{ logins: LoginRow[]; firms?: FirmRow[] }>('/studio-access').then((b) => {
    const logins: StudioLogins = {};
    for (const r of b.logins) {
      logins[r.phone] = { phone: r.phone, firmName: r.firm_name || undefined, role: r.role, visibleTabs: r.visible_tabs, power: r.power };
    }
    return { logins, firms: (b.firms ?? []).map((f) => ({
      partnerId: f.partner_id, firmName: f.firm_name, phones: f.phones, gsts: f.gsts, logins: f.logins, power: f.power,
      orders: (f.orders ?? []).map((o) => ({ enqId: o.enq_id, phone: o.phone, source: o.source, value: o.value, orderedOn: o.ordered_on, status: o.status })),
      referrals: (f.referrals ?? []).map((r) => ({ name: r.name, phone: r.phone, status: r.status, referredOn: r.referred_on, orders: r.orders, value: r.value })),
    })) };
  });
  cached = { at: Date.now(), promise };
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise;
}

export async function addStudioNumber(partnerId: string, phone: string, name: string): Promise<string | null> {
  try {
    await b2bBackendPost('/studio-number', { partner_id: partnerId, phone, name });
    cached = null;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
