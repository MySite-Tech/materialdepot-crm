import { awaitsFollowUp } from '../inbound';
import { OUTREACH_OPEN_STATUSES } from '../outreach';
import { repOwns, sameRep } from '../outreach/handover';
import { nextFollowUp, primaryContact } from '../client';
import { ownsFirm } from '../kam/handover';
import { KAM_OPEN_STATUSES } from '../../constants/kam';
import { REMINDER_ACTIVE_STATES, REMINDER_UPCOMING_DAYS } from './constants';
import { cleanDay, cleanTime, followUpAt, istDayOf, reminderState } from './utils';
import type { Reminder, ReminderPerson, ReminderSources, ReminderState } from './types';

export type { Reminder, ReminderKind, ReminderPerson, ReminderSources, ReminderState } from './types';
export { REMINDER_KIND_LABEL, REMINDER_LEAD_MINUTES, REMINDER_REFRESH_MS, REMINDER_TICK_MS, REMINDER_UPCOMING_DAYS } from './constants';
export { cleanTime, daysLate, fmtFollowUp, fmtTime, minutesUntil, reminderState } from './utils';

const at = (date: string | undefined, time: string | undefined): Pick<Reminder, 'date' | 'time' | 'dueAt'> | null => {
  const d = cleanDay(date);
  if (!d) return null;
  const t = cleanTime(time);
  return { date: d, time: t, dueAt: followUpAt(d, t) };
};

const lastNote = (notes: { text?: string }[] | undefined): string | undefined =>
  String(notes?.[notes.length - 1]?.text || '').trim() || undefined;

export function buildReminders(src: ReminderSources): Reminder[] {
  const out: Reminder[] = [];

  for (const l of src.inbound) {
    const when = awaitsFollowUp(l) ? at(l.followUpDate, l.followUpTime) : null;
    if (!when) continue;
    const call = [...(l.callAttempts || [])].reverse().find((c) => c.note);
    out.push({
      ...when,
      key: `inbound:${l.id}`, kind: 'inbound', team: 'inbound', openId: l.id,
      company: l.company, contact: l.contactName, phone: l.phone,
      context: call?.note || l.requirement || l.leadSummary,
      owner: src.inboundOwnerName(l.ownerId) || l.owner,
      owns: (p) => p.inboundKylasId != null && l.ownerId === p.inboundKylasId,
    });
  }

  for (const l of src.outreach) {
    if (!OUTREACH_OPEN_STATUSES.includes(l.status)) continue;
    const owns = (p: ReminderPerson) => repOwns(p)(l);
    const base = { team: 'outreach' as const, openId: l.id, company: l.company, contact: l.contactPerson, phone: l.phone, owner: l.bm, owns };
    const when = at(l.followUpDate, l.followUpTime);
    if (when) out.push({ ...base, ...when, key: `outreach:${l.id}`, kind: 'outreach', context: lastNote(l.notes) || l.requirement });
    for (const m of l.meetings || []) {
      const mw = m.status === 'Scheduled' ? at(m.date, m.time) : null;
      if (mw) out.push({ ...base, ...mw, key: `meeting:${l.id}:${m.n}`, kind: 'meeting', context: [`Meeting ${m.n}`, m.area || m.officeLocation].filter(Boolean).join(' · ') });
    }
  }

  for (const c of src.clients) {
    if (!c.kam) continue;
    const next = nextFollowUp(c.interactions);
    const when = next ? at(next.date, next.time) : null;
    if (!when || !next) continue;
    const person = primaryContact(c.contacts);
    out.push({
      ...when,
      key: `firm:${c.id}`, kind: 'firm', team: 'kam', openId: c.id,
      company: c.company, contact: person?.name, phone: person?.number,
      context: String(next.from.summary || '').trim() || undefined,
      owner: c.kam,
      owns: (p) => ownsFirm(c, p),
    });
  }

  for (const o of src.orders) {
    if (!KAM_OPEN_STATUSES.includes(o.status)) continue;
    const when = at(o.followUpDate, o.followUpTime);
    if (!when) continue;
    out.push({
      ...when,
      key: `pi:${o.id}`, kind: 'pi', team: 'kam', openId: o.clientId,
      company: o.company, contact: o.contactName, phone: o.phone,
      context: [o.status, o.enqId, o.requirement].filter(Boolean).join(' · '),
      owner: o.kam,
      owns: (p) => sameRep(o.kam, p.name),
    });
  }

  return out.sort((a, b) => a.dueAt - b.dueAt || a.company.localeCompare(b.company));
}

export interface ReminderGroups {
  now: Reminder[];
  today: Reminder[];
  overdue: Reminder[];
  later: Reminder[];
}

export function groupReminders(list: Reminder[], nowMs: number): ReminderGroups {
  const horizon = istDayOf(nowMs + REMINDER_UPCOMING_DAYS * 86_400_000);
  const g: ReminderGroups = { now: [], today: [], overdue: [], later: [] };
  const by: Record<ReminderState, Reminder[]> = { soon: g.now, due: g.now, today: g.today, overdue: g.overdue, later: g.later };
  for (const r of list) {
    const s = reminderState(r, nowMs);
    if (s === 'later' && r.date > horizon) continue;
    by[s].push(r);
  }
  g.overdue.reverse();
  return g;
}

export const activeReminderCount = (list: Reminder[], nowMs: number): number =>
  list.filter((r) => REMINDER_ACTIVE_STATES.includes(reminderState(r, nowMs))).length;

export const scopeReminders = (list: Reminder[], person: ReminderPerson | null): Reminder[] =>
  person ? list.filter((r) => r.owns(person)) : list;
