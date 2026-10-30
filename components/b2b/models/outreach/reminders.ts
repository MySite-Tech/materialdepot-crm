import { OutreachLead } from '../mock-data';
import { withRequirementHistory } from '../requirement';
import {
  COVERAGE_SOURCES, FOLLOW_UPS_REQUIRED, JourneyEvent, OUTREACH_STATUS_LABEL, OutreachMeeting, completedMeetings, followUpMeetings, needsCheckIn, openMeeting,
} from '.';
import { normalisePhone } from '@/lib/org/utils';
import { HANDOVER_TAT_HOURS, handoverState, hoursSince, isMobile, orderVerified } from './handover';
import { intakePending } from './intake';

export const istDay = (iso: string | undefined): string => {
  const s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
};

const meetingWord = (m: OutreachMeeting) => `Meeting ${m.n}${m.date ? ` (${m.date})` : ''}`;

export function journeyDiff(before: OutreachLead | null, after: OutreachLead, by: string, at: string): JourneyEvent[] {
  const ev: JourneyEvent[] = [];
  const push = (kind: JourneyEvent['kind'], text: string) => ev.push({ at, by, kind, text });

  if (!before) {
    if (after.intake?.from === 'Inbound') push('intake', `Assigned to ${after.bm} from Inbound${after.intake.inboundOwner ? ` (worked by ${after.intake.inboundOwner})` : ''}`);
    else push('created', `Created by ${by} · source ${after.source || 'not set'}${after.bm ? '' : ' · left unassigned'}`);
    if (after.intake && after.intake.from !== 'Inbound') push('intake', `Assigned to ${after.bm} by ${after.intake.assignedBy}`);
    if (after.intake?.acceptedAt) push('intake-accepted', `${after.bm} took the lead`);
    for (const m of after.meetings || []) push('meeting-scheduled', `${meetingWord(m)} scheduled`);
    return ev;
  }

  if (before.intake?.assignedAt !== after.intake?.assignedAt && after.intake && after.bm) push('intake', `Assigned to ${after.bm} by ${after.intake.assignedBy}${after.intake.how === 'round-robin' ? ' (round robin)' : ''}`);
  else if (before.bm !== after.bm) push('bm-changed', after.bm ? `BM changed from ${before.bm || 'unassigned'} to ${after.bm}` : `${before.bm} returned the lead to the unassigned pool`);
  if (!before.intake?.acceptedAt && after.intake?.acceptedAt) push('intake-accepted', `${by} accepted the lead${after.intake.from === 'Inbound' ? ' from Inbound' : ''}`);
  if (!before.intake?.rejectedAt && after.intake?.rejectedAt) push('intake-rejected', `${by} rejected the lead${after.intake.from === 'Inbound' ? ' from Inbound' : ''}: ${after.intake.rejectReason || 'no reason'}`);
  if (before.status !== after.status) {
    push('status', `${OUTREACH_STATUS_LABEL[before.status]} → ${OUTREACH_STATUS_LABEL[after.status]}${after.status === 'Lost' && after.lostReason ? ` (${after.lostReason})` : ''}`);
  }

  const prev = new Map((before.meetings || []).map((m) => [m.n, m]));
  for (const m of after.meetings || []) {
    const p = prev.get(m.n);
    if (!p) push('meeting-scheduled', `${meetingWord(m)} scheduled`);
    if (m.status !== p?.status && m.status === 'Completed') push('meeting-held', `${meetingWord(m)} held${m.metWith ? ` with ${m.metWith}` : ''}${m.pin ? ' · pinned on the map' : ''}`);
    if (m.status !== p?.status && m.status === 'Postponed') push('meeting-postponed', `${meetingWord(m)} postponed`);
  }

  const fu = String(after.followUpDate || '').slice(0, 10);
  if (fu && fu !== String(before.followUpDate || '').slice(0, 10)) push('follow-up-set', `Next follow-up set for ${fu}`);
  if ((after.requirementHistory || []).length > (before.requirementHistory || []).length) push('requirement-changed', `Requirement changed: ${String(after.requirement || '').trim() || 'cleared'}`);
  for (const n of (after.notes || []).slice((before.notes || []).length)) push('note-added', `Note: ${n.text}`);
  const known = new Set((before.contacts || []).map((c) => c.name.trim().toLowerCase()));
  for (const c of after.contacts || []) {
    if (c.name.trim() && !known.has(c.name.trim().toLowerCase())) push('contact-added', `Contact added: ${c.name.trim()}${c.role ? ` (${c.role})` : ''}`);
  }

  if (!orderVerified(before) && orderVerified(after)) push('order-verified', `First order ${after.enqId} fetched from the deal ticket`);

  const h0 = before.handover;
  const h1 = after.handover;
  if (h1 && (!h0 || h0.sentAt !== h1.sentAt)) push('handover-sent', `Handed over to ${h1.kam} with the WhatsApp group`);
  if (h1 && h1.status !== h0?.status && h1.status === 'Accepted') push('handover-accepted', `${h1.kam} signed off the handover`);
  if (h1 && h1.status !== h0?.status && h1.status === 'Rejected') push('handover-rejected', `${h1.kam} rejected the handover: ${h1.rejectReason || 'no reason'}`);
  return ev;
}

export function withJourney(before: OutreachLead | null, latest: OutreachLead, by: string, at: string): OutreachLead {
  const after = withRequirementHistory(before, latest, by, at);
  const events = journeyDiff(before, after, by, at);
  const convertedAt = after.status === 'Closed' && !after.convertedAt ? at : after.convertedAt;
  if (!events.length && convertedAt === after.convertedAt) return after;
  return { ...after, convertedAt, journey: [...(after.journey || []), ...events] };
}

export const MET_WITH_FROM = '2026-10-29';

export function meetingGaps(m: OutreachMeeting): string[] {
  if (m.status !== 'Completed') return [];
  return [
    !m.checkIn && needsCheckIn(m.date) ? 'check-in' : '',
    !String(m.metWith || '').trim() && String(m.date || '') >= MET_WITH_FROM ? 'who you met' : '',
    !String(m.notes || '').trim() ? 'notes' : '',
  ].filter(Boolean);
}

export function nextMeetingBlocker(meetings: OutreachMeeting[] | undefined): string | null {
  const open = openMeeting(meetings);
  if (open) return `Meeting ${open.n} is still scheduled — mark it held or postponed first.`;
  const unfinished = (meetings || []).find((m) => meetingGaps(m).length);
  if (unfinished) return `Meeting ${unfinished.n} is marked held — add its ${meetingGaps(unfinished).join(' and ')} first.`;
  return null;
}

const needsNextStep = (l: OutreachLead) => l.status !== 'Closed' && l.status !== 'Lost' && completedMeetings(l.meetings).length > 0
  && !l.followUpDate && !(l.meetings || []).some((m) => m.status === 'Scheduled');

const altPhoneOk = (l: OutreachLead) => !String(l.altPhone || '').trim()
  || (isMobile(l.altPhone) && normalisePhone(l.altPhone) !== normalisePhone(l.phone));

const altContactOk = (l: OutreachLead) => !String(l.altPhone || '').trim()
  || (!!String(l.altName || '').trim() && !!String(l.altRole || '').trim());

const CAPTURE: { label: string; ok: (l: OutreachLead) => boolean }[] = [
  { label: 'owner/designer',      ok: (l) => !!String(l.contactPerson || '').trim() },
  { label: 'their role',          ok: (l) => !!String(l.designation || '').trim() },
  { label: 'mobile',              ok: (l) => isMobile(l.phone) },
  { label: 'segment',             ok: (l) => !!l.segment },
  { label: 'team size',           ok: (l) => !!l.teamSize },
  { label: 'next follow-up date', ok: (l) => !needsNextStep(l) },
];

export function outreachCaptureErrors(l: OutreachLead): string[] {
  const errs = (l.meetings || []).flatMap((m) => {
    const g = meetingGaps(m);
    return g.length ? [`Meeting ${m.n} is marked held — add ${g.join(' and ')}.`] : [];
  });
  if (!altPhoneOk(l)) errs.push('The alternate number must be a different 10-digit mobile.');
  if (!altContactOk(l)) errs.push('The alternate number needs the name and role of the person on it.');
  if ((l.contacts || []).some((c) => !c.name.trim() || !c.role.trim())) errs.push('Every extra contact needs a name and a role.');
  if (l.status === 'Lost' || !completedMeetings(l.meetings).length) return errs;
  const missing = CAPTURE.filter((c) => !c.ok(l)).map((c) => c.label);
  if (missing.length) errs.push(`A visited lead needs ${missing.join(', ')}.`);
  return errs;
}

const ADHERENCE: { label: string; ok: (l: OutreachLead) => boolean }[] = [
  { label: 'firm name',      ok: (l) => !!String(l.company || '').trim() },
  ...CAPTURE.filter((c) => c.label !== 'next follow-up date'),
  { label: 'client type',    ok: (l) => !!l.companyType },
  { label: 'office address', ok: (l) => !!String(l.officeAddress || '').trim() },
  { label: 'meeting notes',  ok: (l) => (l.meetings || []).every((m) => !meetingGaps(m).includes('notes')) },
  { label: 'who they met',   ok: (l) => (l.meetings || []).every((m) => !meetingGaps(m).includes('who you met')) },
  { label: 'next follow-up date', ok: (l) => !needsNextStep(l) },
  { label: 'Enq ID of the first order', ok: (l) => l.status !== 'Closed' || !!String(l.enqId || '').trim() },
  { label: 'KAM handover', ok: (l) => l.status !== 'Closed' || !!l.handover },
];

export function outreachAdherence(l: OutreachLead): string[] {
  return ADHERENCE.filter((a) => !a.ok(l)).map((a) => a.label);
}

export type ReminderLevel = 'overdue' | 'today' | 'todo';

export interface Reminder {
  key: string;
  level: ReminderLevel;
  text: string;
}

export const REMINDER_ORDER: ReminderLevel[] = ['overdue', 'today', 'todo'];

export function outreachReminders(
  l: OutreachLead,
  ctx: { today: string; nowMs: number; onWaitlist: boolean | null },
): Reminder[] {
  if (l.status === 'Lost' || l.intake?.rejectedAt) return [];
  const out: Reminder[] = [];
  const add = (key: string, level: ReminderLevel, text: string) => out.push({ key: `${l.id}:${key}`, level, text });
  const meetings = l.meetings || [];
  const held = completedMeetings(meetings);
  const scheduled = meetings.filter((m) => m.status === 'Scheduled');
  const open = l.status !== 'Closed';

  if (intakePending(l)) add('intake', 'today', `Assigned to you${l.intake?.from === 'Inbound' ? ' from Inbound' : ` by ${l.intake?.assignedBy || 'an admin'}`} — accept it or reject it with a reason`);

  for (const m of scheduled) {
    const d = String(m.date || '').slice(0, 10);
    if (d && d < ctx.today) add(`m${m.n}`, 'overdue', `${meetingWord(m)} has passed — mark it held or postponed`);
    else if (d === ctx.today) add(`m${m.n}`, 'today', `Meeting ${m.n} today${m.time ? ` at ${m.time}` : ''}`);
  }
  for (const m of held) {
    const g = meetingGaps(m);
    if (g.length) add(`n${m.n}`, 'overdue', `Meeting ${m.n} was held — add ${g.join(' and ')}`);
    if (!m.pin) add(`p${m.n}`, 'todo', `Meeting ${m.n} has no live location pin`);
  }

  if (open && l.source && COVERAGE_SOURCES.includes(l.source) && !held.length && !scheduled.length && !intakePending(l)) {
    add('cover', 'today', `${l.source} lead with no meeting booked — schedule the in-person visit`);
  }
  if (open && !held.length && !scheduled.length && l.source && !COVERAGE_SOURCES.includes(l.source)) {
    add('first', 'todo', 'No meeting booked yet');
  }

  if (open) {
    const fu = String(l.followUpDate || '').slice(0, 10);
    if (held.length && !fu && !scheduled.length) add('fu', 'overdue', 'Met, but no next follow-up date or meeting is set');
    else if (fu && fu < ctx.today) add('fu', 'overdue', `Follow-up was due ${fu}`);
    else if (fu === ctx.today) add('fu', 'today', 'Follow-up due today');
    const done = followUpMeetings(meetings).length;
    if (held.length && done < FOLLOW_UPS_REQUIRED && !scheduled.length) {
      add('fu2', 'todo', `${done} of ${FOLLOW_UPS_REQUIRED} follow-up meetings held — book the next one`);
    }
    if (l.status === 'PI Shared' && !String(l.enqId || '').trim()) add('enq', 'todo', 'PI shared — add the Enq ID');
  }

  if (!open) {
    if (!orderVerified(l)) add('verify', 'overdue', 'Converted, but the first order is not fetched from its Enq ID');
    const hs = handoverState(l, ctx.nowMs);
    if (hs === 'ready') add('handover', 'overdue', 'Converted — hand over to a KAM with the WhatsApp group');
    if (hs === 'pending') add('handover', 'todo', `Waiting on ${l.handover!.kam} to sign off (${Math.floor(hoursSince(l.handover!.sentAt, ctx.nowMs))}h of ${HANDOVER_TAT_HOURS}h)`);
    if (hs === 'overdue') add('handover', 'overdue', `${l.handover!.kam} has not signed off in ${HANDOVER_TAT_HOURS}h — chase them`);
    if (hs === 'rejected') add('handover', 'overdue', `${l.handover!.kam} rejected the handover: ${l.handover!.rejectReason || 'no reason given'}`);
  }

  if (held.length && ctx.onWaitlist === false) add('waitlist', 'todo', 'Not on the Studio Space waitlist yet — ask them to join');

  const missing = outreachAdherence(l).filter((m) => m !== 'meeting notes' && m !== 'who they met' && m !== 'next follow-up date'
    && m !== 'Enq ID of the first order' && m !== 'KAM handover');
  if (missing.length) add('fields', 'todo', `Missing ${missing.join(', ')}`);

  return out.sort((a, b) => REMINDER_ORDER.indexOf(a.level) - REMINDER_ORDER.indexOf(b.level));
}
