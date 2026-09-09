import { H, SB_URL } from './sbClient';

export type Shadower = { email: string; name: string };

export function parseShadowers(emailStr?: string | null, nameStr?: string | null): Shadower[] {
  const es = String(emailStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ns = String(nameStr || '').split(',').map((s) => s.trim());
  return es.map((e, i) => ({ email: e, name: ns[i] || e }));
}
export function joinShadowers(list: Shadower[]): { email: string | null; name: string | null } {
  const clean = (list || []).filter((s) => s && s.email);
  if (!clean.length) return { email: null, name: null };
  return { email: clean.map((s) => s.email).join(','), name: clean.map((s) => s.name || s.email).join(',') };
}

export const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Availability = { weeklyOff: number | null; leaveDates: string[] };

export type StaffCaps = { dailyCap: number | null; capOverrides: Record<string, number> };
export const CAPS_COLS = 'daily_cap,cap_overrides';

let capsReady: boolean | null = null;
export async function rosterSelect(cols: string): Promise<string> {
  if (capsReady === null) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=' + CAPS_COLS + '&limit=1', { headers: H });
      if (r.ok) capsReady = true;
      else {
        const body = await r.text().catch(() => '');

        if (body.includes('42703')) capsReady = false;
        else console.error('[siteAudit] caps-column probe failed', r.status, body.slice(0, 200));
      }
    } catch (e) {
      console.error('[siteAudit] caps-column probe failed', e);
    }
  }
  return capsReady ? cols + ',' + CAPS_COLS : cols;
}
export function mapCaps(r: any): StaffCaps {
  return {
    dailyCap: r?.daily_cap == null ? null : Number(r.daily_cap),
    capOverrides: r?.cap_overrides && typeof r.cap_overrides === 'object' && !Array.isArray(r.cap_overrides)
      ? (r.cap_overrides as Record<string, number>)
      : {},
  };
}

export function staffCapOn(
  p: (Partial<Availability> & Partial<StaffCaps> & { activeFrom?: string | null }) | null | undefined,
  ds: string | null | undefined,
  fallback: number,
): number {
  if (!p || !ds) return fallback;
  if (p.activeFrom && ds < p.activeFrom) return 0;
  if (isOffDay(p, ds)) return 0;
  const o = p.capOverrides;
  if (o && o[ds] !== undefined && o[ds] !== null) return Math.max(0, Number(o[ds]) || 0);
  if (p.dailyCap != null) return Math.max(0, p.dailyCap);
  return fallback;
}

export function isOffDay(a: Partial<Availability> | null | undefined, ds?: string | null): boolean {
  if (!a || !ds) return false;
  if (a.weeklyOff != null && new Date(ds + 'T00:00:00').getDay() === a.weeklyOff) return true;
  if (Array.isArray(a.leaveDates) && a.leaveDates.includes(ds)) return true;
  return false;
}
export function offDayReason(a: Partial<Availability> | null | undefined, ds?: string | null): string {
  if (!isOffDay(a, ds)) return '';
  return Array.isArray(a?.leaveDates) && ds && a!.leaveDates!.includes(ds) ? 'on leave' : 'weekly off';
}

