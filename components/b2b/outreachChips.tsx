'use client';

// ── Outreach board — shared chips ────────────────────────────────────────────
// The pieces that are specific to the Outreach vocabulary. Everything generic
// (Pill, Field, SectionCard, ReadValue, Spinner, Empty, GateErrors,
// EnrichmentBadge, FollowUpChip, inputCls, fmtDay) already exists in
// `inboundChips.tsx` and is imported from there rather than copied — the two
// boards are read by the same people and a second spelling of a status pill is
// how they start looking like two different products.

import { Pill } from './inboundChips';
import {
  OUTREACH_STATUS_COLORS, MEETING_STATUS_COLORS, LEAD_TYPE_COLORS,
  companyTypeLabel, meetingLocation,
  type OutreachStatus, type MeetingStatus, type OutreachMeeting,
  type LeadType, type CompanyType,
} from './outreachModel';

export function OutreachStatusBadge({ s }: { s: OutreachStatus }) {
  return <Pill color={OUTREACH_STATUS_COLORS[s]}>{s}</Pill>;
}

export function MeetingStatusChip({ s }: { s: MeetingStatus }) {
  return <Pill color={MEETING_STATUS_COLORS[s]}>{s}</Pill>;
}

export function OutreachLeadTypeChip({ t }: { t?: LeadType }) {
  if (!t) return null;
  return <Pill color={LEAD_TYPE_COLORS[t]}>{t}</Pill>;
}

export function CompanyTypeText({ type, other }: { type?: CompanyType; other?: string }) {
  const label = companyTypeLabel(type, other);
  if (!label) return <span className="text-gray-300">—</span>;
  return <span>{label}</span>;
}

/**
 * A meeting on one line: number, when, where, outcome.
 *
 * A meeting with no date is rendered as "not scheduled" rather than blank —
 * the PRD's whole retry loop is about which of the four have happened, and a
 * row that just looks empty tells a reader nothing about which state it is in.
 */
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

/** "2 of 4 · 1 completed" — the retry loop at a glance on a card or a row. */
export function MeetingProgress({ meetings }: { meetings?: OutreachMeeting[] }) {
  const all = meetings || [];
  if (!all.length) return <span className="text-[10px] text-gray-400">No meetings yet</span>;
  const done = all.filter((m) => m.status === 'Completed').length;
  const postponed = all.filter((m) => m.status === 'Postponed').length;
  return (
    <span className="text-[10px] text-gray-500 whitespace-nowrap">
      {all.length}/4 meetings
      {done > 0 && <span className="text-[#0F766E]"> · {done} held</span>}
      {postponed > 0 && <span className="text-amber-600"> · {postponed} postponed</span>}
    </span>
  );
}
