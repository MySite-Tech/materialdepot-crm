import { LeadNote } from '../../mock-data';
import { completedMeetings } from '../../outreach';
import { sameRep } from '../../outreach/handover';
import { Period, inPeriod } from '../../outreach/kpis';
import { ActivityItem, ActivityKind, PerfCard, PerfData, Person } from '../types';
import { isPerson } from '../utils';

export const fromKpi = (card: PerfCard, key: string, kind: ActivityKind): ActivityItem[] =>
  (card[key]?.rows ?? []).filter((r) => r.at).map((r) => ({ id: `${kind}:${r.id}`, at: r.at!, kind, title: r.title, detail: r.note }));

export function notesBy<T>(records: T[], notesOf: (r: T) => LeadNote[] | undefined, titleOf: (r: T) => string, idOf: (r: T) => string, people: Person[], period: Period): ActivityItem[] {
  return records.flatMap((r) => (notesOf(r) || [])
    .filter((n) => inPeriod(n.ts, period) && isPerson(people, n.author))
    .map((n, i) => ({ id: `note:${idOf(r)}:${n.ts}:${i}`, at: n.ts, kind: 'Note' as const, title: titleOf(r), detail: n.text })));
}

export function redirectsBy(data: PerfData, people: Person[], period: Period): ActivityItem[] {
  return (data.redirects ?? [])
    .filter((v) => v.createdAt && inPeriod(v.createdAt, period) && isPerson(people, v.scheduledBy))
    .map((v) => ({ id: `redirect:${v.id}`, at: v.createdAt!, kind: 'EC redirect' as const, title: v.firm, detail: `Sent to ${v.branch}${v.enqId ? ` · ${v.enqId}` : ''} · ${v.status}` }));
}

export function outreachMeetingsBy(data: PerfData, people: Person[], period: Period): ActivityItem[] {
  return data.outreach.flatMap((l) => completedMeetings(l.meetings)
    .filter((m) => m.date && inPeriod(m.date, period) && (m.loggedBy ? isPerson(people, m.loggedBy) : people.some((p) => sameRep(l.bm, p.name))))
    .map((m) => ({
      id: `meeting:${l.id}:${m.n}`, at: m.date!, kind: 'Meeting' as const, title: l.company,
      detail: [m.n === 1 ? 'First meeting' : `Meeting ${m.n}`, m.metWith && `met ${m.metWith}`, m.notes].filter(Boolean).join(' · '),
    })));
}

export function journeyBy(data: PerfData, people: Person[], period: Period): ActivityItem[] {
  return data.outreach.flatMap((l) => (l.journey || [])
    .filter((e) => !e.kind.startsWith('meeting') && inPeriod(e.at, period) && isPerson(people, e.by))
    .map((e, i) => ({ id: `journey:${l.id}:${e.at}:${i}`, at: e.at, kind: 'Lead update' as const, title: l.company, detail: e.text })));
}

export const newestFirst = (items: ActivityItem[]): ActivityItem[] =>
  [...items].sort((a, b) => String(b.at).localeCompare(String(a.at)));
