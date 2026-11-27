import { sameRep } from '../../models/outreach/handover';
import type { UnifiedLead } from '@/lib/b2b';
import { ALL, LeadFilters, LeadState, Period } from './constants';

const IST_MS = 19_800_000;

export const istDay = (iso: string | undefined): string => {
  const s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? '' : new Date(ms + IST_MS).toISOString().slice(0, 10);
};

const monthStart = (day: string, back: number): string => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};

const daysBack = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export function periodRange(period: Period, from: string, to: string, today: string): { from: string; to: string } {
  switch (period) {
    case 'this-month': return { from: monthStart(today, 0), to: today };
    case 'last-month': return { from: monthStart(today, 1), to: daysBack(monthStart(today, 0), 1) };
    case '30d': return { from: daysBack(today, 29), to: today };
    case '90d': return { from: daysBack(today, 89), to: today };
    case 'custom': return { from, to };
    default: return { from: '', to: '' };
  }
}

export const leadState = (l: UnifiedLead): LeadState => (l.lost ? 'lost' : l.status === 'Closed' ? 'closed' : 'open');

export const ecOf = (l: UnifiedLead): string =>
  l.outreach?.ecReferral?.ec || l.outreach?.ecName || '';

export const referrerOf = (l: UnifiedLead): string => l.outreach?.ecReferral?.by || '';

export const sourceKey = (l: UnifiedLead): string =>
  l.source === 'Inbound' ? 'Inbound' : `Outreach:${l.outreach?.source || 'Unspecified'}`;

export function matchLead(l: UnifiedLead, f: LeadFilters, range: { from: string; to: string }, skip?: keyof LeadFilters): boolean {
  const day = istDay(l.createdAt);
  if (range.from && (!day || day < range.from)) return false;
  if (range.to && (!day || day > range.to)) return false;
  if (skip !== 'state' && f.state !== ALL && leadState(l) !== f.state) return false;
  if (f.source !== ALL) {
    const k = sourceKey(l);
    if (f.source === 'Outreach' ? !k.startsWith('Outreach:') : k !== f.source) return false;
  }
  if (f.owner !== ALL && !sameRep(l.spok, f.owner)) return false;
  if (f.kam !== ALL && !sameRep(l.kam, f.kam)) return false;
  if (f.ec !== ALL && ecOf(l) !== f.ec) return false;
  if (f.referrer !== ALL && referrerOf(l) !== f.referrer) return false;
  if (f.unassigned && l.spok) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [l.companyName, l.contactPerson, l.phone, l.enqId, l.spok, l.kam, l.gstNumber, ecOf(l), referrerOf(l)]
      .filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export const distinct = (values: (string | undefined)[]): string[] =>
  [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function fmtCreated(iso: string | undefined, today: string): string {
  const day = istDay(iso);
  if (!day) return '';
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
}
