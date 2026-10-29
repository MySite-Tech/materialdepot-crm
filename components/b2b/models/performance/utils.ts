import { sameRep } from '../outreach/handover';
import { Period, isWholeMonth } from '../outreach/kpis';
import { Goals, PerfCard, PerfKpiDef, PerfRow, PerfValue, Person } from './types';
import type { B2BTeam, TeamMember } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';

const DAY_MS = 86_400_000;

export const MAX_DAILY_ROWS = 62;

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function elapsedDays(p: Period, today: string): string[] {
  const end = p.to < today ? p.to : today;
  const out: string[] = [];
  for (let d = p.from; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const goalKey = (team: B2BTeam, person: Person): string => `${team}|${person.key}`;

export function goalFor(def: PerfKpiDef, team: B2BTeam, person: Person, goals: Goals): number | null {
  if (def.target === null) return null;
  const set = goals[goalKey(team, person)]?.[def.key];
  return typeof set === 'number' && Number.isFinite(set) ? set : def.target;
}

export function targetFor(def: PerfKpiDef, team: B2BTeam, people: Person[], goals: Goals, period: Period, today: string): number | null {
  if (def.target === null) return null;
  const each = people.length ? people.map((p) => goalFor(def, team, p, goals) as number) : [def.target];
  const total = each.reduce((a, b) => a + b, 0);
  if (def.unit === '%') return Math.round(total / each.length);
  if (def.per === 'day') {
    const days = elapsedDays(period, today).length;
    return days ? total * days : null;
  }
  return isWholeMonth(period) ? Math.round(total * 100) / 100 : null;
}

export function paceFor(def: PerfKpiDef, period: Period, today: string): number | null {
  if (def.unit === '%' || def.per !== 'month' || !isWholeMonth(period) || today < period.from || today > period.to) return null;
  return Number(today.slice(8, 10)) / Number(period.to.slice(8, 10));
}

export interface Tone { bar: string; text: string }

export function tone(v: number | null, target: number | null, pace: number | null): Tone {
  if (v === null || target === null || target <= 0) return { bar: '#9CA3AF', text: v === null ? 'text-gray-400' : 'text-gray-900' };
  const r = v / (target * (pace ?? 1));
  if (r >= 1) return { bar: '#16A34A', text: 'text-green-700' };
  if (r >= 0.6) return { bar: '#F59E0B', text: 'text-amber-700' };
  return { bar: '#EF4444', text: 'text-red-600' };
}

export const fmtNumber = (def: PerfKpiDef, v: number): string =>
  def.unit === '%' ? `${v}%` : def.unit === 'L' ? `₹${v}L` : String(v);

export const fmtValue = (def: PerfKpiDef, k: PerfValue): string =>
  k.unknown ? 'Unknown' : k.value === null ? '—' : fmtNumber(def, k.value);

export const pct = (num: number, den: number): number | null => (den ? Math.round((num / den) * 100) : null);

export const lakhs = (rupees: number): number => Math.round((rupees / 1_00_000) * 100) / 100;

export const counted = (rows: PerfRow[]): number => rows.filter((r) => r.counts).length;

export const countValue = (rows: PerfRow[], sub?: string): PerfValue => ({ value: counted(rows), rows, sub });

export const unknownCard = (defs: PerfKpiDef[], sub: string): PerfCard =>
  Object.fromEntries(defs.map((d) => [d.key, { value: null, unknown: true, sub, rows: [] }]));

const NOT_A_PERSON = new Set(['unassigned', 'unknown', 'none', 'na', 'n/a', '-']);

export const isPlaceholderName = (name: string): boolean => NOT_A_PERSON.has(name.trim().toLowerCase());

export const personKey = (name: string, phone?: string): string => {
  const p = normalisePhone(phone);
  return p.length === 10 ? p : `name:${name.trim().toLowerCase()}`;
};

export const isPerson = (people: Person[], name: string | undefined): boolean =>
  people.some((p) => sameRep(name, p.name));

export function memberPeople(members: TeamMember[], team: TeamMember['team']): Person[] {
  return members
    .filter((m) => m.team === team && m.active)
    .map((m) => ({ key: personKey(m.name, m.phone), name: m.name, phone: m.phone, kylasUserId: m.kylasUserId, onTeam: true }));
}

export function withDataPeople(people: Person[], names: (string | undefined)[], onTeam: boolean): Person[] {
  const out = [...people];
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name || isPlaceholderName(name) || isPerson(out, name)) continue;
    out.push({ key: personKey(name), name, onTeam });
  }
  return out;
}
