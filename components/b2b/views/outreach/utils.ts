'use client';

import { OutreachLead } from '../../models/mock-data';
import { outreachEnrichmentGaps } from '../../models/outreach';
import { repOwns } from '../../models/outreach/handover';
import { Rep } from '../../models/outreach/intake';
import { Period, currentMonth, inPeriod, monthPeriod } from '../../models/outreach/kpis';
import { BmOption, OutreachFilters, RangeKey } from './types';

export const gapsFor = (l: OutreachLead) => outreachEnrichmentGaps({
  contactPerson: l.contactPerson, designation: l.designation, segment: l.segment,
  leadType: l.leadType, companyType: l.companyType, selections: l.selections,
  requirement: l.requirement, expectedOrderValue: l.expectedOrderValue,
});

export const nowIso = () => new Date().toISOString();

const DAY_MS = 86_400_000;

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export const shiftMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export const monthLabel = (ym: string): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function rangeFor(key: RangeKey, today: string, custom: Period): Period | null {
  const month = currentMonth(today);
  switch (key) {
    case 'any': return null;
    case 'today': return { from: today, to: today };
    case 'week': return { from: addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'month': return monthPeriod(month);
    case 'last-month': return monthPeriod(shiftMonth(month, -1));
    case 'custom': return custom.from && custom.to && custom.from <= custom.to ? custom : null;
  }
}

export const fmtRange = (p: Period): string => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return p.from === p.to ? d(p.from) : `${d(p.from)} – ${d(p.to)}`;
};

export function bmOptions(leads: OutreachLead[], reps: Rep[], teamLive: boolean): BmOption[] {
  const list: BmOption[] = reps.map((rep) => ({ rep, leads: 0, onTeam: true }));
  for (const l of leads) {
    let hit = list.find((o) => repOwns(o.rep)(l));
    if (!hit && String(l.bm || '').trim()) {
      hit = { rep: { name: l.bm.trim() }, leads: 0, onTeam: false };
      list.push(hit);
    }
    if (hit) hit.leads += 1;
  }
  return list
    .filter((o) => o.leads > 0 || (teamLive && o.onTeam))
    .sort((a, b) => b.leads - a.leads || a.rep.name.localeCompare(b.rep.name));
}

export const activeFilterCount = (f: OutreachFilters): number =>
  (['companyType', 'leadType', 'segment', 'source'] as const).filter((k) => f[k] !== 'all').length
  + (f.added !== 'any' ? 1 : 0) + (f.onlyGaps ? 1 : 0);

export function matchesFilters(l: OutreachLead, f: OutreachFilters, added: Period | null): boolean {
  if (f.companyType !== 'all' && l.companyType !== f.companyType) return false;
  if (f.leadType !== 'all' && l.leadType !== f.leadType) return false;
  if (f.segment !== 'all' && l.segment !== f.segment) return false;
  if (f.source !== 'all' && (l.source || 'none') !== f.source) return false;
  if (added && !inPeriod(l.createdAt, added)) return false;
  if (f.onlyGaps && gapsFor(l).length === 0) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [l.company, l.contactPerson, l.phone, l.altPhone, l.enqId, l.designation, l.city, l.bm,
      ...(l.contacts || []).flatMap((c) => [c.name, c.phone])].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
