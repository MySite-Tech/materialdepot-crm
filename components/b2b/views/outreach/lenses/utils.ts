import { OutreachLead } from '../../../models/mock-data';
import { OUTREACH_OPEN_STATUSES, hasMeetingOn, nextScheduledMeeting } from '../../../models/outreach';
import { HANDOVER_TAT_HOURS, handoverState, hoursSince } from '../../../models/outreach/handover';
import { intakePending } from '../../../models/outreach/intake';
import { REMINDER_ORDER, Reminder } from '../../../models/outreach/reminders';
import { LENS_STATUS } from '../constants';
import { LensRow, WorkLens } from '../types';

export interface LensCtx { today: string; nowMs: number }

const day = (d: string | undefined) => String(d || '').slice(0, 10);

const HANDOFF_STATES = ['ready', 'overdue', 'rejected'];

export function kamReminders(l: OutreachLead, nowMs: number): Reminder[] {
  const h = l.handover;
  if (!h || h.status !== 'Pending') return [];
  const left = HANDOVER_TAT_HOURS - Math.floor(hoursSince(h.sentAt, nowMs));
  return [{
    key: `${l.id}:kam`,
    level: left < 0 ? 'overdue' : left <= 12 ? 'today' : 'todo',
    text: left < 0 ? `${-left}h past the ${HANDOVER_TAT_HOURS}h sign-off window` : `Sign off within ${left}h`,
  }];
}

export function lensMatches(lens: WorkLens, r: LensRow, ctx: LensCtx): boolean {
  const l = r.lead;
  const status = LENS_STATUS[lens];
  if (status) return l.status === status;
  switch (lens) {
    case 'action': return r.reminders.some((x) => x.level !== 'todo');
    case 'meetings': return hasMeetingOn(l.meetings, ctx.today);
    case 'followups': return OUTREACH_OPEN_STATUSES.includes(l.status) && !!day(l.followUpDate) && day(l.followUpDate) <= ctx.today;
    case 'inbox': return intakePending(l);
    case 'handoff': return HANDOFF_STATES.includes(handoverState(l, ctx.nowMs));
    case 'signoff': return l.handover?.status === 'Pending';
    case 'signed': return l.status === 'Closed';
    default: return true;
  }
}

const meetingKey = (l: OutreachLead, today: string) => {
  const m = (l.meetings || []).find((x) => x.status === 'Scheduled' && day(x.date) === today);
  return m?.time || '99:99';
};

export const nextStepDate = (l: OutreachLead): string => {
  const m = nextScheduledMeeting(l.meetings);
  const f = day(l.followUpDate);
  const md = day(m?.date);
  return [md, f].filter(Boolean).sort()[0] || '';
};

const byLevel = (a: LensRow, b: LensRow) =>
  REMINDER_ORDER.indexOf(a.reminders[0]?.level ?? 'todo') - REMINDER_ORDER.indexOf(b.reminders[0]?.level ?? 'todo')
  || b.reminders.length - a.reminders.length;

const desc = (a: string | undefined, b: string | undefined) => String(b || '').localeCompare(String(a || ''));
const ascBlankLast = (a: string, b: string) => (a ? (b ? a.localeCompare(b) : -1) : b ? 1 : 0);

export function sortLens(lens: WorkLens, rows: LensRow[], ctx: LensCtx): LensRow[] {
  const out = [...rows];
  switch (lens) {
    case 'action': case 'signoff': return out.sort(byLevel);
    case 'meetings': return out.sort((a, b) => meetingKey(a.lead, ctx.today).localeCompare(meetingKey(b.lead, ctx.today)));
    case 'followups': return out.sort((a, b) => day(a.lead.followUpDate).localeCompare(day(b.lead.followUpDate)));
    case 'handoff': case 'won': case 'signed': return out.sort((a, b) => desc(a.lead.convertedAt || a.lead.statusChangedAt, b.lead.convertedAt || b.lead.statusChangedAt));
    case 'lost': return out.sort((a, b) => desc(a.lead.statusChangedAt, b.lead.statusChangedAt));
    case 'all': return out.sort((a, b) => desc(a.lead.createdAt, b.lead.createdAt));
    default: return out.sort((a, b) => ascBlankLast(nextStepDate(a.lead), nextStepDate(b.lead)));
  }
}
