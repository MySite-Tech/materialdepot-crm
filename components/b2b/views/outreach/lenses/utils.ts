import { OutreachLead } from '../../../models/mock-data';
import { OUTREACH_OPEN_STATUSES, hasMeetingOn, heldMeetings, nextScheduledMeeting } from '../../../models/outreach';
import { istDay } from '../../../models/inbound';
import type { DealCtx, LeadDeals } from '@/lib/b2b/inbound-deals/types';
import { dealCtx } from '@/lib/b2b/inbound-deals/utils';
import { HANDOVER_TAT_HOURS, handoverState, hoursSince } from '../../../models/outreach/handover';
import { intakePending } from '../../../models/outreach/intake';
import { REMINDER_ORDER, Reminder } from '../../../models/outreach/reminders';
import { LENS_STATUS } from '../constants';
import { LensRow, WorkLens } from '../types';

export interface LensCtx { today: string; nowMs: number }

const day = (d: string | undefined) => String(d || '').slice(0, 10);

const NO_DEALS: LeadDeals = { carts: [], pis: [] };

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

const touchDay = (l: OutreachLead): string => [
  ...(l.callAttempts || []).map((c) => istDay(c.at)),
  ...heldMeetings(l.meetings).map((m) => day(m.date)),
].sort().pop() || '';

export const outreachDealCtx = (l: OutreachLead, deals?: LeadDeals): DealCtx => dealCtx(deals ?? NO_DEALS, {
  excluded: l.status === 'Lost' || intakePending(l),
  piByStatus: l.status === 'PI Shared',
  piSince: l.status === 'PI Shared' ? istDay(l.statusChangedAt) : '',
  touched: touchDay(l),
});

const lateMeeting = (l: OutreachLead, today: string) =>
  (l.meetings || []).some((m) => m.status === 'Scheduled' && !m.checkIn && !!day(m.date) && day(m.date) < today);

const inWork = (r: LensRow) =>
  OUTREACH_OPEN_STATUSES.includes(r.lead.status) && !intakePending(r.lead) && r.deal.stage === null;

function workLens(r: LensRow, today: string): 'meetings' | 'overdue' | 'due' | 'book' | null {
  if (!inWork(r)) return null;
  const l = r.lead;
  const f = day(l.followUpDate);
  if (hasMeetingOn(l.meetings, today)) return 'meetings';
  if ((f && f < today) || lateMeeting(l, today)) return 'overdue';
  if (f === today) return 'due';
  if (l.status === 'Yet to Meet' && !nextScheduledMeeting(l.meetings)) return 'book';
  return null;
}

export function lensMatches(lens: WorkLens, r: LensRow, ctx: LensCtx): boolean {
  const l = r.lead;
  const status = LENS_STATUS[lens];
  if (status) return l.status === status;
  const c = r.deal;
  switch (lens) {
    case 'work': return workLens(r, ctx.today) !== null;
    case 'meetings': case 'overdue': case 'due': case 'book': return workLens(r, ctx.today) === lens;
    case 'deals': return c.stage !== null;
    case 'cartOpen': return c.stage === 'cart' && !c.updated;
    case 'piOpen': return c.stage === 'pi' && !c.updated;
    case 'cartFollow': return c.stage === 'cart' && c.updated;
    case 'piFollow': return c.stage === 'pi' && c.updated;
    case 'referred': return false;
    case 'action': return r.reminders.some((x) => x.level !== 'todo');
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
    case 'action': case 'signoff': case 'other': return out.sort(byLevel);
    case 'meetings': return out.sort((a, b) => meetingKey(a.lead, ctx.today).localeCompare(meetingKey(b.lead, ctx.today)));
    case 'cartOpen': case 'piOpen': return out.sort((a, b) => b.deal.since.localeCompare(a.deal.since));
    case 'handoff': case 'won': case 'signed': return out.sort((a, b) => desc(a.lead.convertedAt || a.lead.statusChangedAt, b.lead.convertedAt || b.lead.statusChangedAt));
    case 'lost': return out.sort((a, b) => desc(a.lead.statusChangedAt, b.lead.statusChangedAt));
    case 'all': return out.sort((a, b) => desc(a.lead.createdAt, b.lead.createdAt));
    default: return out.sort((a, b) => ascBlankLast(nextStepDate(a.lead), nextStepDate(b.lead)));
  }
}
