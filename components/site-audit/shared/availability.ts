import { H, SB_URL } from './sbClient';

/* ── Shadowers ────────────────────────────────────────────────────────────
   A site audit / installation sub-job can be shadowed (observed) by ANY
   number of registered people, of any role. They ride the existing
   shadower_email / shadower_name text columns comma-joined, so this needs no
   schema change — same encoding material-depot-site writes. */
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

/* ── Availability (profiles.weekly_off / profiles.leave_dates) ─────────────
   A weekday number (0=Sun) the person is always off, plus explicit leave
   dates. Both are advisory at assignment time — the SM can still override,
   exactly like the source app. */
export const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Availability = { weeklyOff: number | null; leaveDates: string[] };

/* ── Daily capacity (profiles.daily_cap / profiles.cap_overrides) ──────────
   How many jobs one auditor/installer can take on one day. Lives in the DB,
   not localStorage: caps used to sit in the SM's browser under
   `md_audit_caps`, which meant the other SM, the SM's own phone and — the
   reason it mattered — the public Store Team kiosk all disagreed about
   capacity. The kiosk didn't read caps at all and counted raw headcount.
   `dailyCap` null = fall back to the caller's default, so a roster row that
   no SM has touched behaves exactly as it did before. See
   site-audit-migration-003-staff-caps.sql. */
export type StaffCaps = { dailyCap: number | null; capOverrides: Record<string, number> };
export const CAPS_COLS = 'daily_cap,cap_overrides';

/* Probe-gated, because PostgREST fails the WHOLE select with 42703
   (undefined_column) if these columns aren't there yet — so asking for them
   before site-audit-migration-003 has been run would take out the roster query
   and with it the store kiosk's ability to book at all. Probed once and
   remembered; when the answer is unknown (network blip) we deliberately return
   the SAFE column list, which just means caps read as their defaults for that
   attempt — exactly the behaviour before this feature. Never the reverse:
   guessing "present" would turn a blip into an outage.
   `rosterSelect('id,name,city')` -> 'id,name,city,daily_cap,cap_overrides'. */
let capsReady: boolean | null = null;
export async function rosterSelect(cols: string): Promise<string> {
  if (capsReady === null) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=' + CAPS_COLS + '&limit=1', { headers: H });
      if (r.ok) capsReady = true;
      else {
        const body = await r.text().catch(() => '');
        // Only a missing column is a durable "no" — anything else is transient
        // and must not be latched.
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
/* Effective cap for one person on one date, or 0 when they are not working it.
   A per-date override wins over their default, which wins over `fallback`. */
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

