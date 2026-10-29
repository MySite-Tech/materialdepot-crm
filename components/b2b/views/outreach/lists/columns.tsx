'use client';

import { OutreachLead, fmtINR } from '../../../models/mock-data';
import { OUTREACH_OPEN_STATUSES, companyTypeLabel, meetingLocation, nextScheduledMeeting } from '../../../models/outreach';
import { HANDOVER_STATE_COLOR, HANDOVER_STATE_LABEL, handoverState, orderVerified } from '../../../models/outreach/handover';
import { Reminder, ReminderLevel } from '../../../models/outreach/reminders';
import { Pill, fmtDay } from '../../../ui/inbound-chips';
import { MeetingDots, OutreachStatusBadge } from '../../../ui/outreach-chips';
import { LENS_STATUS } from '../constants';
import { Lens, LensRow } from '../types';
import { gapsFor } from '../utils';
import { ReactNode } from 'react';

export interface Col {
  head: string;
  cell: (r: LensRow) => ReactNode;
}

const day = (d: string | undefined) => String(d || '').slice(0, 10);
const dash = <span className="text-gray-300">—</span>;
const muted = (v: ReactNode) => <span className="text-gray-500 whitespace-nowrap">{v || dash}</span>;

const LEVEL: Record<ReminderLevel, { dot: string; text: string }> = {
  overdue: { dot: '#EF4444', text: 'text-red-700' },
  today:   { dot: '#F59E0B', text: 'text-amber-800' },
  todo:    { dot: '#9CA3AF', text: 'text-gray-600' },
};

function daysLate(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

function When({ date, time, today }: { date: string; time?: string; today: string }) {
  const late = daysLate(date, today);
  const [text, cls] = late > 0 ? [`${late}d late`, 'text-red-600 font-semibold']
    : late === 0 ? ['Today', 'text-amber-700 font-semibold']
      : late === -1 ? ['Tomorrow', 'text-gray-700'] : [fmtDay(date), 'text-gray-700'];
  return <span className={`whitespace-nowrap ${cls}`} title={date}>{text}{time ? <span className="font-normal text-gray-400"> · {time}</span> : ''}</span>;
}

function Firm({ l }: { l: OutreachLead }) {
  const gaps = gapsFor(l);
  return (
    <div className="min-w-0 max-w-[260px]">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-gray-900 truncate">{l.company || 'Unnamed firm'}</span>
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="shrink-0 text-[10px] font-semibold text-amber-600">⚠ {gaps.length}</span>
        )}
      </div>
      <div className="text-[11px] text-gray-400 truncate">{[l.contactPerson, l.phone].filter(Boolean).join(' · ') || 'No contact'}</div>
    </div>
  );
}

function NextStep({ l, today }: { l: OutreachLead; today: string }) {
  if (!OUTREACH_OPEN_STATUSES.includes(l.status)) return dash;
  const m = nextScheduledMeeting(l.meetings);
  const f = day(l.followUpDate);
  const useMeeting = !!m?.date && (!f || day(m.date) <= f);
  if (!useMeeting && !f) {
    return OUTREACH_OPEN_STATUSES.includes(l.status) ? <span className="text-[11px] text-amber-600 whitespace-nowrap">Nothing booked</span> : dash;
  }
  return (
    <div className="leading-tight">
      <When date={useMeeting ? day(m!.date) : f} time={useMeeting ? m!.time : l.followUpTime} today={today} />
      <div className="text-[10.5px] text-gray-400 whitespace-nowrap">{useMeeting ? `Meeting ${m!.n}` : 'Follow-up'}</div>
    </div>
  );
}

function Due({ rs }: { rs: Reminder[] }) {
  if (!rs.length) return dash;
  const [first, ...rest] = rs;
  return (
    <div className="flex items-start gap-1.5 max-w-[360px]" title={rs.map((r) => `• ${r.text}`).join('\n')}>
      <span className="w-1.5 h-1.5 rounded-full mt-[6px] shrink-0" style={{ background: LEVEL[first.level].dot }} />
      <span className={`leading-snug truncate ${LEVEL[first.level].text}`}>{first.text}</span>
      {rest.length > 0 && <span className="text-[10.5px] text-gray-400 whitespace-nowrap mt-[1px]">+{rest.length} more</span>}
    </div>
  );
}

function FirstOrder({ l }: { l: OutreachLead }) {
  if (!orderVerified(l)) return <span className="text-amber-600 text-[11px] whitespace-nowrap">{l.enqId ? `${l.enqId} not fetched` : 'No Enq ID'}</span>;
  return (
    <span className="font-mono text-gray-700 whitespace-nowrap">
      {fmtINR(l.orderValue || 0)}
      {l.newOnboarding === false && <span className="ml-1 text-[10px] font-sans text-amber-700" title="This number ordered in the 6 months before">repeat</span>}
    </span>
  );
}

const value = (l: OutreachLead) => (l.orderValue
  ? <span className="font-mono text-gray-700 whitespace-nowrap">{fmtINR(l.orderValue)}</span>
  : l.expectedOrderValue ? <span className="font-mono text-gray-400 whitespace-nowrap" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span> : dash);

export function columnsFor(lens: Lens, { today, nowMs, showBm }: { today: string; nowMs: number; showBm: boolean }): Col[] {
  const firm: Col = { head: 'Firm', cell: (r) => <Firm l={r.lead} /> };
  const stage: Col = { head: 'Stage', cell: (r) => <OutreachStatusBadge s={r.lead.status} /> };
  const meetings: Col = { head: 'Meetings', cell: (r) => <MeetingDots meetings={r.lead.meetings} /> };
  const next: Col = { head: 'Next step', cell: (r) => <NextStep l={r.lead} today={today} /> };
  const bm: Col[] = showBm ? [{ head: 'BM', cell: (r) => muted(r.lead.bm) }] : [];
  const handover: Col = {
    head: 'Handover',
    cell: (r) => { const hs = handoverState(r.lead, nowMs); return <Pill color={HANDOVER_STATE_COLOR[hs]}>{HANDOVER_STATE_LABEL[hs]}</Pill>; },
  };
  const converted: Col = { head: 'Converted', cell: (r) => muted(fmtDay(r.lead.convertedAt || r.lead.statusChangedAt)) };

  if (lens.startsWith('kpi:')) {
    return [
      firm,
      {
        head: 'Counts?',
        cell: (r) => (
          <div className="flex items-start gap-1.5 max-w-[340px]">
            <span className={`shrink-0 font-bold ${r.kpi?.counts ? 'text-[#0F766E]' : 'text-amber-600'}`}>{r.kpi?.counts ? '✓' : '✕'}</span>
            <span className={`leading-snug ${r.kpi?.counts ? 'text-gray-600' : 'text-amber-700'}`}>{r.kpi?.note}</span>
          </div>
        ),
      },
      { head: 'Date', cell: (r) => muted(r.kpi?.at ? fmtDay(r.kpi.at) : '') },
      stage, meetings, ...bm,
    ];
  }
  switch (lens) {
    case 'action':
      return [firm, { head: "What's due", cell: (r) => <Due rs={r.reminders} /> }, stage, next, ...bm];
    case 'meetings':
      return [
        {
          head: 'Time',
          cell: (r) => <span className="font-mono font-semibold text-gray-800">{(r.lead.meetings || []).find((m) => m.status === 'Scheduled' && day(m.date) === today)?.time || '—'}</span>,
        },
        firm,
        {
          head: 'Meeting',
          cell: (r) => {
            const m = (r.lead.meetings || []).find((x) => x.status === 'Scheduled' && day(x.date) === today);
            return <div className="leading-tight"><div className="text-gray-700 whitespace-nowrap">Meeting {m?.n} of 4</div><div className="text-[10.5px] text-gray-400 truncate max-w-[200px]">{meetingLocation(m) || 'No location'}</div></div>;
          },
        },
        stage, ...bm,
      ];
    case 'followups':
      return [firm, { head: 'Follow-up', cell: (r) => <When date={day(r.lead.followUpDate)} time={r.lead.followUpTime} today={today} /> }, stage, meetings, ...bm];
    case 'handoff': case 'won':
      return [firm, converted, { head: 'First order', cell: (r) => <FirstOrder l={r.lead} /> }, handover, { head: 'KAM', cell: (r) => muted(r.lead.handover?.kam || r.lead.kam) }, ...bm];
    case 'lost':
      return [firm, { head: 'Lost reason', cell: (r) => r.lead.lostReason || <span className="text-amber-600 text-[11px]">No reason recorded</span> }, meetings, { head: 'Lost on', cell: (r) => muted(fmtDay(r.lead.statusChangedAt)) }, ...bm];
    case 'quote': case 'pi':
      return [firm, { head: 'Value', cell: (r) => value(r.lead) }, { head: 'Enq ID', cell: (r) => r.lead.enqId ? <span className="font-mono text-gray-600">{r.lead.enqId}</span> : dash }, next, meetings, ...bm];
    case 'signoff': case 'signed':
      return [
        firm,
        { head: 'From BM', cell: (r) => muted(r.lead.bm) },
        converted,
        { head: 'First order', cell: (r) => <FirstOrder l={r.lead} /> },
        lens === 'signoff'
          ? { head: 'Waiting', cell: (r) => <Due rs={r.reminders} /> }
          : handover,
        {
          head: 'WhatsApp',
          cell: (r) => (r.lead.whatsappGroupLink
            ? <a href={r.lead.whatsappGroupLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-[#0F766E] hover:underline">Group</a>
            : <span className="text-amber-600 text-[11px]">none</span>),
        },
      ];
    default:
      return [
        firm,
        ...(LENS_STATUS[lens as keyof typeof LENS_STATUS] ? [] : [stage]),
        meetings, next,
        { head: 'Client type', cell: (r) => muted(companyTypeLabel(r.lead.companyType, r.lead.companyTypeOther)) },
        ...bm,
      ];
  }
}
