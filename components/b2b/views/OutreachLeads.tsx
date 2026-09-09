'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtINR, B2B_REPS, type OutreachLead } from '../models/mockData';
import {
  OUTREACH_STATUSES, OUTREACH_STATUS_COLORS, OUTREACH_STATUS_HINT,
  OUTREACH_LOST_REASONS, OUTREACH_PRD_VIEWS,
  SEGMENTS, LEAD_TYPES, SELECTIONS, COMPANY_TYPES,
  outreachGateErrors, outreachEnrichmentGaps, outreachSummary,
  companyTypeLabel, followUpBucket, istToday, meetingLocation,
  nextScheduledMeeting, hasMeetingOn, meetingsExhausted,
  type OutreachStatus, type OutreachView, type OutreachMeeting,
  type Segment, type LeadType, type Selection, type CompanyType, type FollowUpBucket,
} from '../models/outreachModel';
import {
  Spinner, Empty, GateErrors, Field, FollowUpChip, EnrichmentBadge,
  inputCls, errorInputCls, fmtDay,
} from '../ui/inboundChips';
import { OutreachStatusBadge, OutreachLeadTypeChip, MeetingProgress } from '../ui/outreachChips';
import { fetchOutreachLeads, upsertOutreachLead } from '@/lib/b2bLeads';
import OutreachDrawer from '../drawers/OutreachDrawer';
import {
  ExportButton, exportRowsCsv, exportRowsExcel, todayStr, useDragAutoScroll, LostReasonSelect,
  type ExportFormat, type ExportScope,
} from '../ui/exportUtils';

const EXPORT_HEADERS = [
  'Company', 'Contact person', 'Designation', 'Contact number', 'GST',
  'Segment', 'Lead type', 'Company type', 'BM',
  'Meetings', 'Held', 'Next meeting', 'Location',
  'Selection', 'Requirement', 'Expected value',
  'Status', 'Next follow-up', 'Enq ID', 'Order value', 'Expected closure',
  'Lost reason', 'Spok', 'KAM', 'EC', 'EC BM',
];

const toExportRow = (l: OutreachLead): (string | number)[] => {
  const next = nextScheduledMeeting(l.meetings);
  return [
    l.company || '',
    l.contactPerson || '',
    l.designation || '',
    l.phone || '',
    l.gstNumber || '',
    l.segment || '',
    l.leadType || '',
    companyTypeLabel(l.companyType, l.companyTypeOther),
    l.bm || '',
    l.meetings?.length || 0,
    (l.meetings || []).filter((m) => m.status === 'Completed').length,
    next ? `${next.date || ''}${next.time ? ` ${next.time}` : ''}` : '',
    meetingLocation(next),
    (l.selections || []).join(' / '),
    l.requirement || '',
    l.expectedOrderValue || '',
    l.status,
    l.followUpDate || '',
    l.enqId || '',
    l.orderValue || '',
    l.expectedClosure || '',
    l.lostReason || '',
    l.spok || l.bm || '',
    l.kam || '',
    l.ecName || '',
    l.ecBmName || '',
  ];
};

const gapsFor = (l: OutreachLead) => outreachEnrichmentGaps({
  contactPerson: l.contactPerson, designation: l.designation, segment: l.segment,
  leadType: l.leadType, companyType: l.companyType, selections: l.selections,
  requirement: l.requirement, expectedOrderValue: l.expectedOrderValue,
});

const nowIso = () => new Date().toISOString();

function Tile({ label, value, sub, accent, muted }: {
  label: string; value: string; sub?: string; accent?: string; muted?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />}
        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      </div>
      <div className={`text-[22px] font-bold leading-tight mt-1 ${muted ? 'text-gray-300' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function MoveModal({ lead, target, onCancel, onDone }: {
  lead: OutreachLead;
  target: OutreachStatus;
  onCancel: () => void;
  onDone: (patch: Partial<OutreachLead>) => void;
}) {
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate || '');
  const [followUpTime, setFollowUpTime] = useState(lead.followUpTime || '');
  const [enqId, setEnqId] = useState(lead.enqId || '');
  const [lostReason, setLostReason] = useState(lead.lostReason || '');
  const [touched, setTouched] = useState(false);

  const errors = outreachGateErrors({ status: target, followUpDate, lostReason });
  const needsFollowUp = target === 'Follow up' || target === 'PI Shared';
  const wantsEnq = target === 'PI Shared' || target === 'Closed';
  const needsReason = target === 'Lost';

  const commit = () => {
    if (errors.length) { setTouched(true); return; }
    onDone({
      status: target,
      followUpDate: needsFollowUp ? followUpDate : lead.followUpDate,
      followUpTime: needsFollowUp ? followUpTime : lead.followUpTime,
      enqId: wantsEnq ? enqId.trim() || undefined : lead.enqId,
      lostReason: needsReason ? lostReason : lead.lostReason,
    });
  };

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-[440px] mx-4">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-bold text-gray-900">Move to {target}</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            {lead.company}
            {lead.contactPerson ? ` · ${lead.contactPerson}` : ''}
            {' · '}{OUTREACH_STATUS_HINT[target]}
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {needsFollowUp && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Next follow-up date" required error={touched ? errors.find((e) => e.includes('follow-up')) : undefined}>
                <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                  className={touched && !followUpDate ? errorInputCls : inputCls} />
              </Field>
              <Field label="Time" hint="Optional">
                <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          {wantsEnq && (
            <Field
              label="Enq ID"
              hint="Optional here — without it the order value stays blank until you add it in the lead."
            >
              <input value={enqId} onChange={(e) => setEnqId(e.target.value)} placeholder="ENQ-…" className={inputCls} />
            </Field>
          )}
          {needsReason && (
            <Field label="Lost reason" required error={touched ? errors.find((e) => e.includes('lost reason')) : undefined}>
              <LostReasonSelect
                value={lostReason}
                options={OUTREACH_LOST_REASONS}
                onChange={setLostReason}
                className={touched && !lostReason ? errorInputCls : inputCls}
              />
            </Field>
          )}
          {target === 'Quote Share' && (
            <p className="text-[11px] text-gray-500 leading-snug">
              This logs the quote as shared with the client. The PRD leaves a follow-up date optional
              on Quote Share — set one in the lead if you plan to chase it.
            </p>
          )}
          {target === 'Closed' && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Open the lead afterwards to fetch the order details and assign a <strong>KAM</strong> —
              neither blocks the move.
            </p>
          )}
          {touched && errors.length > 0 && <GateErrors errors={errors} />}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={commit} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Move</button>
        </div>
      </div>
    </div>
  );
}

function CreateLeadModal({ onClose, onCreate, defaultBm }: {
  onClose: () => void;
  onCreate: (lead: OutreachLead) => void;
  defaultBm: string;
}) {
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');
  const [leadType, setLeadType] = useState<LeadType | ''>('');
  const [companyType, setCompanyType] = useState<CompanyType | ''>('');
  const [companyTypeOther, setCompanyTypeOther] = useState('');
  const [bm, setBm] = useState(defaultBm);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [requirement, setRequirement] = useState('');
  const [expectedOrderValue, setExpectedOrderValue] = useState('');
  const [mDate, setMDate] = useState('');
  const [mTime, setMTime] = useState('');
  const [mArea, setMArea] = useState('');
  const [mOffice, setMOffice] = useState('');
  const [touched, setTouched] = useState(false);

  const toggle = (s: Selection) =>
    setSelections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const save = () => {
    if (!company.trim()) { setTouched(true); return; }
    const meetings: OutreachMeeting[] = mDate
      ? [{
        n: 1, date: mDate, time: mTime || undefined,
        area: mArea.trim() || undefined, officeLocation: mOffice.trim() || undefined,
        status: 'Scheduled', loggedBy: bm, updatedAt: nowIso(),
      }]
      : [];
    onCreate({
      id: `OR-${Date.now()}`,
      company: company.trim(),
      contactPerson: contactPerson.trim(),
      designation: designation.trim() || undefined,
      phone: phone.trim() || undefined,
      gstNumber: gstNumber.trim() || undefined,
      segment: segment || undefined,
      leadType: leadType || undefined,
      companyType: companyType || undefined,
      companyTypeOther: companyType === 'Other' ? (companyTypeOther.trim() || undefined) : undefined,
      bm,
      createdAt: nowIso(),
      meetings,
      selections,
      requirement: requirement.trim() || undefined,
      expectedOrderValue: Number(expectedOrderValue) || undefined,

      status: 'Yet to Meet',
      statusChangedAt: nowIso(),
      spok: bm,
      notes: [],
      value: 0,
    });
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[620px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Create Lead</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Field visit · starts in &ldquo;Yet to Meet&rdquo;</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name" required error={touched && !company.trim() ? 'A company name is required.' : undefined}>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={touched && !company.trim() ? errorInputCls : inputCls} />
            </Field>
            <Field label="Contact person">
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Designation">
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Principal Architect, Partner…" className={inputCls} />
            </Field>
            <Field label="Contact number">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="GST" hint="Optional — not mandatory">
              <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Segment">
              <select value={segment} onChange={(e) => setSegment(e.target.value as Segment | '')} className={inputCls}>
                <option value="">—</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Lead type">
              <select value={leadType} onChange={(e) => setLeadType(e.target.value as LeadType | '')} className={inputCls}>
                <option value="">—</option>
                {LEAD_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Company type">
              <select value={companyType} onChange={(e) => setCompanyType(e.target.value as CompanyType | '')} className={inputCls}>
                <option value="">—</option>
                {COMPANY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            {companyType === 'Other' && (
              <Field label="Specify">
                <input value={companyTypeOther} onChange={(e) => setCompanyTypeOther(e.target.value)} className={inputCls} />
              </Field>
            )}
            <Field label="BM (owner)">
              <select value={bm} onChange={(e) => setBm(e.target.value)} className={inputCls}>
                {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requirement (optional now)</span>
            <div className="flex flex-wrap gap-2">
              {SELECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggle(s)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${selections.includes(s) ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Requirement summary">
                <textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
              </Field>
              <Field label="Expected order value (₹)" hint="Your estimate — never reported as revenue">
                <input type="number" min={0} value={expectedOrderValue} onChange={(e) => setExpectedOrderValue(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Schedule meeting 1 (optional)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Date"><input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Time"><input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} className={inputCls} /></Field>
              <Field label="Area"><input value={mArea} onChange={(e) => setMArea(e.target.value)} className={inputCls} /></Field>
              <Field label="Office location"><input value={mOffice} onChange={(e) => setMOffice(e.target.value)} className={inputCls} /></Field>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Create lead</button>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, today, onClick, onDragStart }: {
  lead: OutreachLead; today: string; onClick: () => void; onDragStart: () => void;
}) {
  const gaps = gapsFor(lead);
  const next = nextScheduledMeeting(lead.meetings);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#0F766E] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-[12.5px] font-semibold text-gray-900 leading-tight min-w-0 truncate">{lead.company}</div>
        <OutreachLeadTypeChip t={lead.leadType} />
      </div>
      <div className="text-[10.5px] text-gray-400 mt-0.5 truncate">
        {[lead.contactPerson, lead.designation].filter(Boolean).join(' · ') || '—'}
      </div>
      {lead.companyType && (
        <div className="text-[10px] text-gray-500 mt-1">{companyTypeLabel(lead.companyType, lead.companyTypeOther)}</div>
      )}
      {next && (
        <div className="text-[10.5px] text-[#0F766E] mt-1.5">
          Next: {fmtDay(next.date)}{next.time ? ` · ${next.time}` : ''}
        </div>
      )}
      {(lead.status === 'Follow up' || lead.status === 'PI Shared') && (
        <div className="mt-1.5"><FollowUpChip date={lead.followUpDate} today={today} /></div>
      )}
      {(lead.status === 'PI Shared' || lead.status === 'Closed') && !!lead.orderValue && (
        <div className="text-[11px] font-mono font-semibold text-gray-700 mt-1.5">{fmtINR(lead.orderValue)}</div>
      )}
      {lead.status === 'Quote Share' && !!lead.expectedOrderValue && (
        <div className="text-[11px] font-mono text-gray-500 mt-1.5" title="The BM's estimate, not a quoted figure">
          ~{fmtINR(lead.expectedOrderValue)}
        </div>
      )}
      {lead.status === 'Lost' && (
        <div className="text-[10.5px] text-red-500 mt-1.5 leading-snug">
          {lead.lostReason || <span className="text-amber-600">No reason recorded</span>}
        </div>
      )}
      {lead.status === 'Closed' && (
        <div className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">
          {lead.kam ? `KAM: ${lead.kam}` : <span className="text-amber-600">No KAM assigned</span>}
        </div>
      )}
      {meetingsExhausted(lead.meetings) && (
        <div className="text-[10px] text-amber-700 mt-1.5 leading-snug">All 4 meetings postponed — decide Lost or park</div>
      )}
      <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <MeetingProgress meetings={lead.meetings} />
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">
            ⚠ {gaps.length}
          </span>
        )}
      </div>
    </div>
  );
}

function TodayTable({ leads, today, onOpen }: {
  leads: OutreachLead[]; today: string; onOpen: (id: string) => void;
}) {
  const rows = useMemo(() => leads
    .map((l) => ({ lead: l, meeting: (l.meetings || []).find((m) => m.status === 'Scheduled' && String(m.date || '').slice(0, 10) === today)! }))
    .filter((r) => !!r.meeting)
    .sort((a, b) => (a.meeting.time || '99:99').localeCompare(b.meeting.time || '99:99')),
  [leads, today]);

  if (!rows.length) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No meetings scheduled for today in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2">
        <h3 className="text-[12px] font-bold text-gray-800">Meetings today</h3>
        <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
        <span className="text-[10px] text-gray-400 hidden sm:inline">Soonest first. Mark each Completed or Postponed in the lead.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Time', 'Company', 'Contact', 'Type', 'Meeting', 'Location', 'Status', 'BM', ''].map((h, i) => (
                <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead: l, meeting: m }) => {
              const gaps = gapsFor(l);
              return (
                <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{m.time || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {l.contactPerson || '—'}
                    {l.phone && <span className="font-mono text-gray-400"> · {l.phone}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">#{m.n} of 4</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{meetingLocation(m) || '—'}</td>
                  <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                  <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BUCKET_ORDER: FollowUpBucket[] = ['overdue', 'today', 'upcoming', 'none'];
const BUCKET_TITLE: Record<FollowUpBucket, string> = {
  overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', none: 'No follow-up date set',
};
const BUCKET_NOTE: Record<FollowUpBucket, string> = {
  overdue:  'Past their follow-up date — chase these first.',
  today:    "Today's committed follow-ups.",
  upcoming: 'Scheduled ahead.',
  none:     'On a status that carries a date but has none.',
};

function FollowUpTable({ leads, today, onOpen }: {
  leads: OutreachLead[]; today: string; onOpen: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<FollowUpBucket, OutreachLead[]> = { overdue: [], today: [], upcoming: [], none: [] };
    for (const l of leads) g[followUpBucket(l.followUpDate, today)].push(l);
    for (const k of BUCKET_ORDER) {
      g[k].sort((a, b) => {
        const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
        if (d !== 0) return k === 'upcoming' ? d : -d;
        return (a.followUpTime || '').localeCompare(b.followUpTime || '');
      });
    }
    return g;
  }, [leads, today]);

  if (!BUCKET_ORDER.some((k) => grouped[k].length > 0)) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No leads on follow-up in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {BUCKET_ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (!rows.length) return null;
        return (
          <div key={bucket} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-baseline gap-2 px-4 py-2.5 border-b border-gray-100 min-w-0">
              <h3 className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{BUCKET_TITLE[bucket]}</h3>
              <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
              <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{BUCKET_NOTE[bucket]}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Company', 'Contact', 'Type', 'Status', 'Meetings', 'Follow-up', 'BM', 'Value', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const gaps = gapsFor(l);
                    return (
                      <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                        <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                        <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                        <td className="px-3 py-2"><MeetingProgress meetings={l.meetings} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.followUpDate
                            ? <span className="text-gray-600">{fmtDay(l.followUpDate)}{l.followUpTime ? ` · ${l.followUpTime}` : ''}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                          {l.orderValue ? fmtINR(l.orderValue)
                            : l.expectedOrderValue ? <span className="text-gray-400" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span>
                              : '—'}
                        </td>
                        <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusTable({ status, leads, onOpen }: {
  status: OutreachStatus; leads: OutreachLead[]; onOpen: (id: string) => void;
}) {
  if (!leads.length) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No {status} leads in this filter.</Empty>
      </div>
    );
  }
  const showValue = status !== 'Lost';
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Company', 'Contact', 'Type', 'Enq ID', showValue ? 'Order value' : 'Lost reason',
                status === 'Closed' ? 'KAM' : 'Follow-up', 'Expected closure', 'BM'].map((h, i) => (
                <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{l.enqId || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {showValue
                    ? (l.orderValue
                      ? <span className="font-mono text-gray-700">{fmtINR(l.orderValue)}</span>
                      : <span className="text-amber-600 text-[11px]">not fetched</span>)
                    : (l.lostReason || <span className="text-amber-600 text-[11px]">No reason recorded</span>)}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {status === 'Closed'
                    ? (l.kam || <span className="text-amber-600 text-[11px]">Unassigned</span>)
                    : (l.followUpDate ? fmtDay(l.followUpDate) : '—')}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.expectedClosure ? fmtDay(l.expectedClosure) : '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function OutreachLeads() {
  const [view, setView] = useState<OutreachView>('today');

  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [bm, setBm] = useState('all');
  const [status, setStatus] = useState<'all' | OutreachStatus>('all');
  const [companyType, setCompanyType] = useState('all');
  const [leadType, setLeadType] = useState('all');
  const [segment, setSegment] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<OutreachStatus | null>(null);
  const [move, setMove] = useState<{ lead: OutreachLead; target: OutreachStatus } | null>(null);

  const today = istToday();

  const load = () => {
    setLoading(true);
    setError(null);
    fetchOutreachLeads({ createdFrom, createdTo })
      // A failed read is reported, never rendered as "no leads" — a BM would
      // read an empty board as a day with nothing on it.
      .then(setLeads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load outreach leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [createdFrom, createdTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (bm !== 'all' && l.bm !== bm) return false;
      if (status !== 'all' && l.status !== status) return false;
      if (companyType !== 'all' && l.companyType !== companyType) return false;
      if (leadType !== 'all' && l.leadType !== leadType) return false;
      if (segment !== 'all' && l.segment !== segment) return false;
      if (onlyGaps && gapsFor(l).length === 0) return false;
      if (q) {
        const hay = [l.company, l.contactPerson, l.phone, l.enqId, l.designation]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, bm, status, companyType, leadType, segment, onlyGaps, search]);

  const byStatus = (s: OutreachStatus) => filtered.filter((l) => l.status === s);
  const summary = useMemo(() => outreachSummary(filtered, today), [filtered, today]);

  const applyPatch = async (lead: OutreachLead, patch: Partial<OutreachLead>) => {
    const statusChanged = patch.status !== undefined && patch.status !== lead.status;
    const updated: OutreachLead = {
      ...lead,
      ...patch,
      statusChangedAt: statusChanged ? nowIso() : lead.statusChangedAt,
      quoteSharedAt: patch.status === 'Quote Share' && !lead.quoteSharedAt ? nowIso() : lead.quoteSharedAt,
      value: Number(patch.orderValue ?? lead.orderValue) || 0,
    };

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    const err = await upsertOutreachLead(updated);
    if (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      setMoveError(`Could not move ${lead.company}: ${err}`);
    }
  };

  const requestMove = (id: string, target: OutreachStatus) => {
    const lead = leads.find((l) => l.id === id);
    setDragId(null);
    setDragOver(null);
    if (!lead || lead.status === target) return;
    setMoveError(null);
    const errs = outreachGateErrors({ status: target, followUpDate: lead.followUpDate, lostReason: lead.lostReason });

    if (errs.length || target === 'Quote Share' || target === 'Closed' || target === 'PI Shared') {
      setMove({ lead, target });
      return;
    }
    applyPatch(lead, { status: target });
  };

  const createLead = async (lead: OutreachLead) => {
    setLeads((prev) => [lead, ...prev]);
    setCreating(false);
    const err = await upsertOutreachLead(lead);
    if (err) {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setError(`Could not save ${lead.company}: ${err}. The lead was not created — try again.`);
    }
  };

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    const list = scope === 'all' ? leads : filtered;
    if (!list.length) { setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_outreach_leads_${scope}_${todayStr()}`;
      const rows = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(EXPORT_HEADERS, rows, name, 'Outreach Leads');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setBm('all'); setStatus('all'); setCompanyType('all'); setLeadType('all');
    setSegment('all'); setCreatedFrom(''); setCreatedTo(''); setSearch(''); setOnlyGaps(false);
  };
  const activeFilters = [
    bm !== 'all', status !== 'all', companyType !== 'all', leadType !== 'all',
    segment !== 'all', !!createdFrom, !!createdTo, !!search.trim(), onlyGaps,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  const todayLeads = useMemo(() => filtered.filter((l) => hasMeetingOn(l.meetings, today)), [filtered, today]);
  const followUpLeads = useMemo(
    () => filtered.filter((l) => l.status === 'Follow up' || l.status === 'PI Shared' || l.status === 'Quote Share'),
    [filtered],
  );

  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [filtered.length, view]);
  const listPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const listRows = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);

  const VIEW_TABS: { key: OutreachView; label: string }[] = [
    ...OUTREACH_PRD_VIEWS.map((v) => ({ key: v.key, label: v.label })),
    { key: 'board', label: 'Board' },
    { key: 'list', label: 'List' },
  ];
  const viewNote = OUTREACH_PRD_VIEWS.find((v) => v.key === view)?.note;

  return (
    <div className="p-4 sm:p-6">

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Outreach</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Field visits — architects, interior designers, contractors &amp; builders
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={() => setCreating(true)}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap"
          >
            + Create Lead
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
        <Tile
          label="Today's meetings"
          value={String(summary.meetingsToday)}
          sub="leads with a meeting today"
          accent={OUTREACH_STATUS_COLORS['Yet to Meet']}
          muted={summary.meetingsToday === 0}
        />
        <Tile
          label="Follow up"
          value={String(summary.followUp.count)}
          sub={summary.followUp.overdue ? `${summary.followUp.overdue} overdue · ${summary.followUp.dueToday} due today` : `${summary.followUp.dueToday} due today`}
          accent={OUTREACH_STATUS_COLORS['Follow up']}
        />
        <Tile
          label="Quote Shared"
          value={String(summary.quoteShared.count)}
          sub={summary.quoteShared.estimatedValue ? `~${fmtINR(summary.quoteShared.estimatedValue)} estimated` : 'no estimate entered'}
          accent={OUTREACH_STATUS_COLORS['Quote Share']}
        />
        <Tile
          label="PI Shared"
          value={String(summary.piShared.count)}
          sub={summary.piShared.orderValue ? fmtINR(summary.piShared.orderValue) : 'no order value yet'}
          accent={OUTREACH_STATUS_COLORS['PI Shared']}
        />
        <Tile label="Lost" value={String(summary.lost)} accent={OUTREACH_STATUS_COLORS.Lost} muted={summary.lost === 0} />
      </div>
      <p className="text-[10px] text-gray-400 mb-4 leading-snug">
        Counts cover the {activeFilters ? 'current filter' : 'loaded window'}. <strong>PI Shared</strong> revenue is
        the order value fetched from the deal ticket; <strong>Quote Shared</strong> is the BM&apos;s own expected order
        value, which is why it is shown as an estimate and never added to the other.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Company, contact, phone or Enq ID…"
              className={inputCls}
            />
          </div>
          {([
            ['Status', 'All statuses', status, setStatus, ['all', ...OUTREACH_STATUSES]],
            ['BM', 'All BMs', bm, setBm, ['all', ...B2B_REPS]],
            ['Company type', 'All types', companyType, setCompanyType, ['all', ...COMPANY_TYPES]],
            ['Lead type', 'All lead types', leadType, setLeadType, ['all', ...LEAD_TYPES]],
            ['Segment', 'All segments', segment, setSegment, ['all', ...SEGMENTS]],
          ] as const).map(([label, allLabel, val, setter, opts]) => (
            <div key={label}>
              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
              <select
                value={val as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
              >
                {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Created from</label>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <button
            onClick={() => setOnlyGaps((v) => !v)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              onlyGaps ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
            }`}
          >
            ⚠ Needs filling
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {VIEW_TABS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${view === v.key ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {viewNote && <span className="text-[10.5px] text-gray-400">{viewNote}</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} className="text-[11px] font-semibold text-red-700 underline">Retry</button>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none">×</button>
          </div>
        </div>
      )}
      {moveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading outreach leads…" /></div>
      ) : (
        <>
          {view === 'today' && <TodayTable leads={todayLeads} today={today} onOpen={setSelectedId} />}
          {view === 'followups' && <FollowUpTable leads={followUpLeads} today={today} onOpen={setSelectedId} />}
          {view === 'pi' && <StatusTable status="PI Shared" leads={byStatus('PI Shared')} onOpen={setSelectedId} />}
          {view === 'closed' && <StatusTable status="Closed" leads={byStatus('Closed')} onOpen={setSelectedId} />}
          {view === 'lost' && <StatusTable status="Lost" leads={byStatus('Lost')} onOpen={setSelectedId} />}

          {view === 'board' && (
            <div
              ref={kanbanScroll.ref}
              className="flex gap-3 overflow-x-auto pb-3 items-start"
              onDragOver={kanbanScroll.onDragOver}
              onDragEnd={kanbanScroll.onDragEnd}
              onDrop={kanbanScroll.onDrop}
            >
              {OUTREACH_STATUSES.map((s) => {
                const items = byStatus(s);
                const isOver = dragOver === s;
                return (
                  <div
                    key={s}
                    className="flex-1 min-w-[220px] shrink-0"
                    onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
                    onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
                    onDrop={() => dragId && requestMove(dragId, s)}
                  >
                    <div className={`bg-[#F2F2F3] rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
                      <div className="h-1" style={{ background: OUTREACH_STATUS_COLORS[s] }} />
                      <div className="px-3 py-2 bg-white border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{s}</span>
                          <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                        </div>
                        <p className="text-[9.5px] text-gray-400 leading-snug mt-0.5">{OUTREACH_STATUS_HINT[s]}</p>
                      </div>
                      <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                        {items.length === 0
                          ? <div className="text-[11px] text-gray-400 text-center py-5">{isOver ? 'Drop here' : 'Empty'}</div>
                          : items.map((l) => (
                            <LeadCard
                              key={l.id}
                              lead={l}
                              today={today}
                              onClick={() => setSelectedId(l.id)}
                              onDragStart={() => setDragId(l.id)}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'list' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {['Company', 'Contact', 'Designation', 'Type', 'Seg', 'Lead', 'Status', 'Meetings',
                        'Follow-up', 'Enq ID', 'Value', 'BM', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((l) => {
                      const gaps = gapsFor(l);
                      return (
                        <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                          <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate">{l.company}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.designation || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{l.segment || '—'}</td>
                          <td className="px-3 py-2"><OutreachLeadTypeChip t={l.leadType} /></td>
                          <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                          <td className="px-3 py-2"><MeetingProgress meetings={l.meetings} /></td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.followUpDate ? fmtDay(l.followUpDate) : '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{l.enqId || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                            {l.orderValue ? fmtINR(l.orderValue)
                              : l.expectedOrderValue ? <span className="text-gray-400" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span>
                                : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                          <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {listRows.length === 0 && <Empty>No leads match these filters.</Empty>}
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">Page {listPage + 1} of {listPages} · {filtered.length} shown</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setListPage((p) => Math.max(0, p - 1))} disabled={listPage === 0}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
                  <button onClick={() => setListPage((p) => Math.min(listPages - 1, p + 1))} disabled={listPage >= listPages - 1}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateLeadModal
          onClose={() => setCreating(false)}
          onCreate={createLead}
          defaultBm={bm !== 'all' ? bm : B2B_REPS[0]}
        />
      )}

      {move && (
        <MoveModal
          lead={move.lead}
          target={move.target}
          onCancel={() => setMove(null)}
          onDone={(patch) => { applyPatch(move.lead, patch); setMove(null); }}
        />
      )}

      {selected && (
        <OutreachDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
        />
      )}
    </div>
  );
}
