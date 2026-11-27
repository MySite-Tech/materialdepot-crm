import { Period, monthPeriod } from '../../models/outreach/kpis';
import { ENGINES, TEAM_ORDER } from '../../models/performance';
import { PerfData, Person } from '../../models/performance/types';
import { addDays } from '../../models/performance/utils';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import type { B2BTeam, TeamMember } from '@/lib/b2b/team/types';
import { coverLabel, coverState } from '@/lib/b2b/team/utils';

const shiftMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function periodFor(key: string, today: string, custom: Period): Period {
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week': return { from: addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'last-month': return monthPeriod(shiftMonth(today.slice(0, 7), -1));
    case 'custom': return custom.from && custom.to && custom.from <= custom.to ? custom : { from: today, to: today };
    default: return monthPeriod(today.slice(0, 7));
  }
}

export const fmtDay = (d: string, weekday = false): string =>
  new Date(`${d}T00:00:00Z`).toLocaleString('en-IN', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: 'UTC' });

export const overlaps = (t: { from: string | null; to: string | null }, p: Period): boolean =>
  (!t.to || t.to >= p.from) && (!t.from || t.from <= p.to);

export function tenureLine(t: { from: string | null; to: string | null }, today: string): string {
  const end = t.to ?? today;
  const days = t.from ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${t.from}T00:00:00Z`)) / 86_400_000) + 1 : null;
  const span = t.from ? `${fmtDay(t.from)} ${t.from.slice(0, 4)} – ${t.to ? `${fmtDay(t.to)} ${t.to.slice(0, 4)}` : 'today'}` : `until ${fmtDay(end)} ${end.slice(0, 4)}`;
  return `On the team ${span}${days ? ` · ${days} days` : ''}`;
}

export const fmtPeriod = (p: Period): string => (p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} – ${fmtDay(p.to)}`);

export function personTag(p: Person, team: B2BTeam): string | null {
  if (p.tenure?.to && !p.onTeam) return `Left ${fmtDay(p.tenure.to)}`;
  if (p.cover) return coverLabel(p.cover);
  if (p.primaryTeam && p.primaryTeam !== team) return `${B2B_TEAM_LABEL[p.primaryTeam]} is their team`;
  return null;
}

export interface RosterEntry { person: Person; now: B2BTeam; tags: string[] }

export function rosterOf(data: PerfData, members: TeamMember[], live: boolean): { team: B2BTeam; people: RosterEntry[] }[] {
  const seen = new Map<string, RosterEntry & { home: B2BTeam }>();
  for (const t of TEAM_ORDER) {
    for (const p of ENGINES[t].people(data, members, live)) {
      const tag = p.tenure?.to && !p.onTeam ? `left ${fmtDay(p.tenure.to)}` : p.cover ? `${coverLabel(p.cover)} on ${B2B_TEAM_LABEL[t]}` : null;
      const covering = !!p.cover && coverState(p.cover) === 'covering';
      const hit = seen.get(p.key);
      if (!hit) seen.set(p.key, { person: p, home: p.primaryTeam ?? t, now: covering ? t : p.primaryTeam ?? t, tags: tag ? [tag] : [] });
      else {
        if (tag) hit.tags.push(tag);
        if (covering) hit.now = t;
      }
    }
  }
  const all = [...seen.values()].sort((a, b) => a.person.name.localeCompare(b.person.name));
  return TEAM_ORDER.map((team) => ({ team, people: all.filter((e) => e.home === team) }));
}
