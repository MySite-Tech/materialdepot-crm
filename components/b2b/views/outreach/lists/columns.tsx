'use client';

import { OutreachLead, fmtINR } from '../../../models/mock-data';
import { OUTREACH_OPEN_STATUSES, companyTypeLabel, meetingLocation, nextScheduledMeeting } from '../../../models/outreach';
import { HANDOVER_STATE_COLOR, HANDOVER_STATE_LABEL, handoverState, orderVerified, whatsappDeclineReason } from '../../../models/outreach/handover';
import { Reminder, ReminderLevel } from '../../../models/outreach/reminders';
import { Pill, fmtDay } from '../../../ui/inbound-chips';
import { MeetingDots, OutreachStatusBadge, WaitlistChip } from '../../../ui/outreach-chips';
import { WaitlistIndex, waitlistFor } from '../../../models/outreach/kpis';
import { DEAL_LENSES, LENS_STATUS } from '../constants';
import { LensRow, WorkLens } from '../types';
import { gapsFor } from '../utils';
import { fmtTime } from '../../../models/reminders';
import { ReactNode } from 'react';

export interface ColUi {
  viewDeal: (enqId: string) => void;
}

export interface Col {
  head: string;
  cell: (r: LensRow, ui: ColUi) => ReactNode;
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
  return <span className={`whitespace-nowrap ${cls}`} title={date}>{text}{time ? <span className="font-normal text-gray-400"> · {fmtTime(time)}</span> : ''}</span>;
}

function DealCell({ r, ui }: { r: LensRow; ui: ColUi }) {
  const c = r.deal;
  const d = c.stage === 'pi' ? c.pis[0] : c.carts[0];
  if (!d) return <span className="text-[11px] text-gray-500">PI shared · no PI ticket on its numbers</span>;
  const more = c.carts.length + c.pis.length - 1;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); ui.viewDeal(d.enqId); }}
      title="Show the products and full detail under this lead"
      className="flex flex-col gap-0.5 min-w-0 text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-indigo-50/60"
    >
      <span className="flex items-baseline gap-1.5">
        <span className={`text-[10px] font-semibold rounded px-1 ${d.kind === 'pi' ? 'bg-purple-50 text-purple-700' : 'bg-indigo-50 text-indigo-700'}`}>{d.kind === 'pi' ? 'PI' : 'Cart'}</span>
        <span className="font-mono text-gray-800">{d.value ? fmtINR(d.value) : '₹0'}</span>
      </span>
      <span className="text-[11px] text-gray-500 truncate"><span className="font-mono">{d.enqId}</span> · opened {fmtDay(d.createdOn)}{more > 0 ? ` · +${more} more` : ''}</span>
      {(d.branch || d.bm) && <span className="text-[11px] text-gray-400 truncate">{[d.branch, d.bm].filter(Boolean).join(' · ')}</span>}
      <span className="text-[11px] font-medium text-indigo-700">View products</span>
    </button>
  );
}

function OpenTicketChip({ r, ui }: { r: LensRow; ui: ColUi }) {
  const d = r.deal.pis[0] ?? r.deal.carts[0];
  if (!d) return null;
  const more = r.deal.carts.length + r.deal.pis.length - 1;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); ui.viewDeal(d.enqId); }}
      title={`${d.enqId} · ${d.status} · opened ${fmtDay(d.createdOn)}${d.branch ? ` · ${d.branch}` : ''}. Click to show the products and full detail under this lead.`}
      className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium ${d.kind === 'pi' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
    >
      {d.kind === 'pi' ? 'PI' : 'Cart'} still open · {fmtINR(d.value)}{more > 0 ? ` · +${more}` : ''}
    </button>
  );
}

function LastTouch({ r }: { r: LensRow }) {
  if (!r.deal.updated) return <span className="text-amber-700 font-semibold whitespace-nowrap">None since {fmtDay(r.deal.since)}</span>;
  return <span className="text-gray-600 whitespace-nowrap">Since {fmtDay(r.deal.since)}</span>;
}

function Firm({ l }: { l: OutreachLead }) {
  const gaps = gapsFor(l);
  return (
    <div className="min-w-0 max-w-[260px]">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-gray-900 truncate">{l.company || 'Unnamed firm'}</span>
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="shrink-0 text-[10px] font-semibold text-red-600 bg-red-50 rounded px-1">{gaps.length} missing</span>
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

export function columnsFor(lens: WorkLens, { today, nowMs, showBm, waitlist }: { today: string; nowMs: number; showBm: boolean; waitlist: WaitlistIndex }): Col[] {
  const firm: Col = DEAL_LENSES.includes(lens)
    ? { head: 'Firm', cell: (r) => <Firm l={r.lead} /> }
    : { head: 'Firm', cell: (r, ui) => <div><Firm l={r.lead} /><OpenTicketChip r={r} ui={ui} /></div> };
  const stage: Col = { head: 'Stage', cell: (r) => <OutreachStatusBadge s={r.lead.status} /> };
  const meetings: Col = { head: 'Meetings', cell: (r) => <MeetingDots meetings={r.lead.meetings} /> };
  const next: Col = { head: 'Next step', cell: (r) => <NextStep l={r.lead} today={today} /> };
  const bm: Col[] = showBm ? [{ head: 'BM', cell: (r) => muted(r.lead.bm) }] : [];
  const handover: Col = {
    head: 'Handover',
    cell: (r) => { const hs = handoverState(r.lead, nowMs); return <Pill color={HANDOVER_STATE_COLOR[hs]}>{HANDOVER_STATE_LABEL[hs]}</Pill>; },
  };
  const onWaitlist: Col = { head: 'Waitlist', cell: (r) => <WaitlistChip w={waitlistFor(r.lead, waitlist)} short /> };
  const converted: Col = { head: 'Converted', cell: (r) => muted(fmtDay(r.lead.convertedAt || r.lead.statusChangedAt)) };

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
            return <div className="leading-tight"><div className="text-gray-700 whitespace-nowrap">Meeting {m?.n}</div><div className="text-[10.5px] text-gray-400 truncate max-w-[200px]">{meetingLocation(m) || 'No location'}</div></div>;
          },
        },
        stage, ...bm,
      ];
    case 'overdue': case 'due': case 'work':
      return [firm, next, stage, meetings, ...bm];
    case 'book':
      return [firm, { head: 'Source', cell: (r) => muted(r.lead.source) }, { head: 'Added', cell: (r) => muted(fmtDay(r.lead.createdAt)) }, stage, ...bm];
    case 'deals': case 'cartOpen': case 'piOpen': case 'cartFollow': case 'piFollow':
      return [firm, { head: 'Cart / PI', cell: (r, ui) => <DealCell r={r} ui={ui} /> }, { head: 'Last call or meeting', cell: (r) => <LastTouch r={r} /> }, next, stage, ...bm];
    case 'other':
      return [firm, { head: "What's due", cell: (r) => <Due rs={r.reminders} /> }, stage, handover, ...bm];
    case 'handoff': case 'won':
      return [firm, converted, { head: 'First order', cell: (r) => <FirstOrder l={r.lead} /> }, handover, onWaitlist, { head: 'KAM', cell: (r) => muted(r.lead.handover?.kam || r.lead.kam) }, ...bm];
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
            : whatsappDeclineReason(r.lead)
              ? <span title={whatsappDeclineReason(r.lead)} className="text-gray-500 text-[11px]">Not willing</span>
              : <span className="text-amber-600 text-[11px]">none</span>),
        },
      ];
    default:
      return [
        firm,
        ...(LENS_STATUS[lens as keyof typeof LENS_STATUS] ? [] : [stage]),
        meetings, next, onWaitlist,
        { head: 'Client type', cell: (r) => muted(companyTypeLabel(r.lead.companyType, r.lead.companyTypeOther)) },
        ...bm,
      ];
  }
}
