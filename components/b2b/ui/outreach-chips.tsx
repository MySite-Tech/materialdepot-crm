'use client';

import { Pill } from './inbound-chips';
import {
  OUTREACH_STATUS_COLORS, OUTREACH_STATUS_LABEL, MEETING_STATUS_COLORS, CONTACT_ROLES, LEAD_TYPE_COLORS, STUDIO_WAITLIST_URL, meetingLocation,
  type OutreachStatus, type MeetingStatus, type OutreachMeeting,
  type LeadType, type WaitlistSignup,
} from '../models/outreach';

export function OutreachStatusBadge({ s }: { s: OutreachStatus }) {
  return <Pill color={OUTREACH_STATUS_COLORS[s]}>{OUTREACH_STATUS_LABEL[s]}</Pill>;
}

export function MeetingStatusChip({ s }: { s: MeetingStatus }) {
  return <Pill color={MEETING_STATUS_COLORS[s]}>{s}</Pill>;
}

export function OutreachLeadTypeChip({ t }: { t?: LeadType }) {
  if (!t) return null;
  return <Pill color={LEAD_TYPE_COLORS[t]}>{t}</Pill>;
}

export function MeetingLine({ m }: { m: OutreachMeeting }) {
  const where = meetingLocation(m);
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
      <span className="font-semibold text-gray-700 whitespace-nowrap">Meeting {m.n}</span>
      <MeetingStatusChip s={m.status} />
      <span className="text-gray-500 whitespace-nowrap">
        {m.date ? `${m.date}${m.time ? ` · ${m.time}` : ''}` : <span className="text-amber-600">not scheduled</span>}
      </span>
      {where && <span className="text-gray-400 truncate">{where}</span>}
    </div>
  );
}

export function MeetingProgress({ meetings }: { meetings?: OutreachMeeting[] }) {
  const all = meetings || [];
  if (!all.length) return <span className="text-[10px] text-gray-400">No meetings yet</span>;
  const done = all.filter((m) => m.status === 'Completed').length;
  const postponed = all.filter((m) => m.status === 'Postponed').length;
  return (
    <span className="text-[10px] text-gray-500 whitespace-nowrap">
      {all.length} {all.length === 1 ? 'meeting' : 'meetings'}
      {done > 0 && <span className="text-[#0F766E]"> · {done} held</span>}
      {postponed > 0 && <span className="text-amber-600"> · {postponed} postponed</span>}
    </span>
  );
}

const MEETING_DOTS = 6;

export function MeetingDots({ meetings }: { meetings?: OutreachMeeting[] }) {
  const all = [...(meetings || [])].sort((a, b) => a.n - b.n);
  const title = all.length
    ? all.map((m) => `Meeting ${m.n}: ${m.status}${m.date ? ` · ${m.date}` : ''}`).join('\n')
    : 'No meetings yet';
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      {!all.length && <span className="w-2 h-2 rounded-full" style={{ boxShadow: 'inset 0 0 0 1px #D1D5DB' }} />}
      {all.slice(-MEETING_DOTS).map((m) => (
        <span key={m.n} className="w-2 h-2 rounded-full" style={{ background: MEETING_STATUS_COLORS[m.status] }} />
      ))}
      {all.length > MEETING_DOTS && <span className="text-[10px] text-gray-400">+{all.length - MEETING_DOTS}</span>}
    </span>
  );
}

export function WaitlistChip({ w, error, short }: { w: WaitlistSignup | null | undefined; error?: string | null; short?: boolean }) {
  if (w === undefined) return <span title={error || 'Studio Space waitlist did not load'}><Pill color="#9CA3AF">{short ? 'Unknown' : 'Waitlist unknown'}</Pill></span>;
  if (w) return <span title={`Joined ${w.createdAt.slice(0, 10)} as ${w.firmName} · Studio Space status ${w.status}`}><Pill color="#8B5CF6">{short ? 'Joined' : 'On Studio Space waitlist'}</Pill></span>;
  return (
    <a href={STUDIO_WAITLIST_URL} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="No waitlist sign-up on this mobile. Share this link with them.">
      <Pill color="#F59E0B">{short ? 'Not yet' : 'Not on waitlist'}</Pill>
    </a>
  );
}

export const RoleOptions = ({ id }: { id: string }) => (
  <datalist id={id}>{CONTACT_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
);
