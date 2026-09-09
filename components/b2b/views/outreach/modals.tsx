'use client';

import { Selection } from '../../models/outreachModel';

import { B2B_REPS, OutreachLead } from '../../models/mockData';
import { COMPANY_TYPES, CompanyType, LEAD_TYPES, LeadType, OUTREACH_LOST_REASONS, OUTREACH_STATUS_HINT, OutreachMeeting, OutreachStatus, SEGMENTS, SELECTIONS, Segment, outreachGateErrors } from '../../models/outreachModel';
import { LostReasonSelect } from '../../ui/exportUtils';
import { Field, GateErrors, errorInputCls, inputCls } from '../../ui/inboundChips';
import { nowIso } from '../../utils/outreach-leads';
import { useState } from 'react';

export function MoveModal({ lead, target, onCancel, onDone }: {
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

export function CreateLeadModal({ onClose, onCreate, defaultBm }: {
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
