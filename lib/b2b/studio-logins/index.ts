import { b2bBackendGet } from '../data/backend';
import type { StudioLogin, StudioLogins } from '@/components/b2b/models/client';

const TTL_MS = 60_000;

interface LoginRow {
  phone: string;
  firm_name: string | null;
  role: string;
  visible_tabs: string[] | null;
  power: boolean;
}

let cached: { at: number; promise: Promise<StudioLogins> } | null = null;

export function fetchStudioLogins(): Promise<StudioLogins> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = b2bBackendGet<{ logins: LoginRow[] }>('/studio-access').then((b) => {
    const out: StudioLogins = {};
    for (const r of b.logins) {
      out[r.phone] = { phone: r.phone, firmName: r.firm_name || undefined, role: r.role, visibleTabs: r.visible_tabs, power: r.power };
    }
    return out;
  });
  cached = { at: Date.now(), promise };
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise;
}
