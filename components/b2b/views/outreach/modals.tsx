'use client';

import { ContactsEditor, RoleOptions } from '../../drawers/outreach/cards/client';
import { OutreachLead } from '../../models/mock-data';
import {
  COMPANY_TYPES, CompanyType, LEAD_TYPES, LeadType, OUTREACH_LOST_REASONS, OUTREACH_SOURCES, OUTREACH_SOURCE_HINT,
  OUTREACH_STATUS_HINT, OUTREACH_STATUS_LABEL, OutreachContact, OutreachMeeting, OutreachSource, OutreachStatus, SEGMENTS,
  SELECTIONS, Segment, Selection, TEAM_SIZES, TeamSize, istToday, outreachGateErrors,
} from '../../models/outreach';
import { isMobile, sameRep } from '../../models/outreach/handover';
import { normalisePhone } from '@/lib/org/utils';
import { Rep } from '../../models/outreach/intake';
import { LostReasonSelect } from '../../ui/lost-reason-select';
import { Field, GateErrors, errorInputCls, inputCls } from '../../ui/inbound-chips';
import { newB2BId } from '../../models/ids';
import { nowIso } from './utils';
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
            <h3 className="text-[14px] font-bold text-gray-900">Move to {OUTREACH_STATUS_LABEL[target]}</h3>
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
              Converted means the first order is placed. Open the lead afterwards to fetch the order from
              its Enq ID (the conversion only counts once fetched) and send the KAM handover with the
              WhatsApp group.
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

export function CreateLeadModal({ reps, me, canPickBm, assigner, onClose, onCreate }: {
  reps: Rep[];
  me: Rep;
  canPickBm: boolean;
  assigner: boolean;
  onClose: () => void;
  onCreate: (lead: OutreachLead) => void;
}) {
  const [source, setSource] = useState<OutreachSource>('Own research');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [teamSize, setTeamSize] = useState<TeamSize | ''>('');
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [altName, setAltName] = useState('');
  const [altRole, setAltRole] = useState('');
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [followUpDate, setFollowUpDate] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');
  const [leadType, setLeadType] = useState<LeadType | ''>('');
  const [companyType, setCompanyType] = useState<CompanyType | ''>('');
  const [companyTypeOther, setCompanyTypeOther] = useState('');
  const [bm, setBm] = useState((reps.find((r) => r.name === me.name) || reps[0] || me).name);
  const rep = canPickBm ? reps.find((r) => r.name === bm) || { name: bm } : me;
  const toPool = assigner && bm === '';
  const assignedByAdmin = assigner && !toPool && !sameRep(rep.name, me.name);
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

  const errors: Partial<Record<'company' | 'contactPerson' | 'designation' | 'phone' | 'altPhone' | 'altName' | 'altRole' | 'segment' | 'teamSize' | 'next' | 'contacts', string>> = {
    ...(!company.trim() && { company: 'A company name is required.' }),
    ...(!contactPerson.trim() && { contactPerson: 'Who is the owner or designer?' }),
    ...(!designation.trim() && { designation: 'What is their role?' }),
    ...(!isMobile(phone) && { phone: 'A 10-digit mobile is required.' }),
    ...(altPhone.trim() && (!isMobile(altPhone) || normalisePhone(altPhone) === normalisePhone(phone)) && { altPhone: 'Must be a different 10-digit mobile.' }),
    ...(altPhone.trim() && !altName.trim() && { altName: 'Whose number is it?' }),
    ...(altPhone.trim() && !altRole.trim() && { altRole: 'What is their role?' }),
    ...(!segment && { segment: 'Pick a segment.' }),
    ...(!teamSize && { teamSize: 'Pick a team size.' }),
    ...(!toPool && !mDate && !followUpDate && { next: 'Book meeting 1 or set a next follow-up date — every lead needs a next step.' }),
    ...(contacts.some((c) => !c.name.trim() || !c.role.trim()) && { contacts: 'Every extra person needs a name and a role.' }),
  };
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const cls = (k: keyof typeof errors) => (err(k) ? errorInputCls : inputCls);

  const save = () => {
    if (Object.keys(errors).length) { setTouched(true); return; }
    const meetings: OutreachMeeting[] = mDate
      ? [{
        n: 1, date: mDate, time: mTime || undefined,
        area: mArea.trim() || undefined, officeLocation: mOffice.trim() || undefined,
        status: 'Scheduled', loggedBy: rep.name || me.name, updatedAt: nowIso(),
      }]
      : [];
    onCreate({
      id: newB2BId('OR'),
      company: company.trim(),
      contactPerson: contactPerson.trim(),
      designation: designation.trim() || undefined,
      phone: normalisePhone(phone),
      altPhone: altPhone.trim() ? normalisePhone(altPhone) : undefined,
      altName: altPhone.trim() ? altName.trim() : undefined,
      altRole: altPhone.trim() ? altRole.trim() : undefined,
      contacts: contacts.map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone?.trim() || undefined })),
      followUpDate: followUpDate || undefined,
      gstNumber: gstNumber.trim() || undefined,
      segment: segment || undefined,
      leadType: leadType || undefined,
      companyType: companyType || undefined,
      companyTypeOther: companyType === 'Other' ? (companyTypeOther.trim() || undefined) : undefined,
      bm: rep.name,
      bmPhone: rep.phone,
      source,
      intake: assignedByAdmin ? { from: source, assignedAt: nowIso(), assignedBy: me.name, how: 'manual' } : undefined,
      email: email.trim() || undefined,
      city: city.trim() || undefined,
      officeAddress: officeAddress.trim() || undefined,
      teamSize: teamSize || undefined,
      whatsappGroupLink: whatsappGroupLink.trim() || undefined,
      createdAt: nowIso(),
      meetings,
      selections,
      requirement: requirement.trim() || undefined,
      expectedOrderValue: Number(expectedOrderValue) || undefined,

      status: 'Yet to Meet',
      statusChangedAt: nowIso(),
      spok: rep.name,
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
            <Field label="Company name" required error={err('company')}>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={cls('company')} />
            </Field>
            <Field label="Owner / designer" required error={err('contactPerson')}>
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={cls('contactPerson')} />
            </Field>
            <Field label="Their role" required error={err('designation')}>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} list="outreach-new-roles" placeholder="Owner / Principal, Partner…" className={cls('designation')} />
              <RoleOptions id="outreach-new-roles" />
            </Field>
            <Field label="Mobile" required error={err('phone')}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cls('phone')} />
            </Field>
            <Field label="Alternate number" hint="Optional — a second mobile for the firm" error={err('altPhone')}>
              <input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className={cls('altPhone')} />
            </Field>
            {altPhone.trim() && (
              <>
                <Field label="Name on alternate" required error={err('altName')}>
                  <input value={altName} onChange={(e) => setAltName(e.target.value)} className={cls('altName')} />
                </Field>
                <Field label="Their role" required error={err('altRole')}>
                  <input value={altRole} onChange={(e) => setAltRole(e.target.value)} list="outreach-new-roles" className={cls('altRole')} />
                </Field>
              </>
            )}
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="GST" hint="Optional — not mandatory">
              <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Segment" required error={err('segment')}>
              <select value={segment} onChange={(e) => setSegment(e.target.value as Segment | '')} className={cls('segment')}>
                <option value="">—</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Team size" required error={err('teamSize')}>
              <select value={teamSize} onChange={(e) => setTeamSize(e.target.value as TeamSize | '')} className={cls('teamSize')}>
                <option value="">—</option>
                {TEAM_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="City">
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Office address" className="sm:col-span-2">
              <input value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Lead type">
              <select value={leadType} onChange={(e) => setLeadType(e.target.value as LeadType | '')} className={inputCls}>
                <option value="">—</option>
                {LEAD_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Client type">
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
            <Field label="Source" hint={OUTREACH_SOURCE_HINT[source]}>
              <select value={source} onChange={(e) => setSource(e.target.value as OutreachSource)} className={inputCls}>
                {OUTREACH_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="BM (owner)" hint={assigner ? (toPool ? 'Goes to the unassigned pool under Assignments' : assignedByAdmin ? 'They must accept it before it counts as theirs' : undefined) : undefined}>
              {canPickBm ? (
                <select value={bm} onChange={(e) => setBm(e.target.value)} className={inputCls}>
                  {assigner && <option value="">Unassigned — assign later</option>}
                  {reps.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
                </select>
              ) : <input value={me.name} disabled className={inputCls} />}
            </Field>
            <Field label="WhatsApp group" hint="Good to have now; required at KAM handover" className="sm:col-span-2">
              <input value={whatsappGroupLink} onChange={(e) => setWhatsappGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" className={inputCls} />
            </Field>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <ContactsEditor contacts={contacts} onChange={setContacts} />
            {err('contacts') && <p className="text-[10px] text-red-500 mt-1">{err('contacts')}</p>}
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
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Next step — book meeting 1 or set a follow-up date</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Meeting date"><input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={cls('next')} /></Field>
              <Field label="Time"><input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} className={inputCls} /></Field>
              <Field label="Area"><input value={mArea} onChange={(e) => setMArea(e.target.value)} className={inputCls} /></Field>
              <Field label="Office location"><input value={mOffice} onChange={(e) => setMOffice(e.target.value)} className={inputCls} /></Field>
              <Field label="Or next follow-up" className="col-span-2 sm:col-span-1">
                <input type="date" value={followUpDate} min={istToday()} onChange={(e) => setFollowUpDate(e.target.value)} className={cls('next')} />
              </Field>
            </div>
            {err('next') && <p className="text-[10px] text-red-500 mt-1.5">{err('next')}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          {touched && Object.keys(errors).length > 0 && (
            <span className="mr-auto text-[11px] text-red-600">Fill the {Object.keys(errors).length} highlighted field{Object.keys(errors).length === 1 ? '' : 's'} to create the lead.</span>
          )}
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Create lead</button>
        </div>
      </div>
    </div>
  );
}
