'use client';

import { INBOUND_STATUS_HINT, InboundStatus, closureReadiness, hasConnected, statusGateErrors } from '../../../models/inbound';
import { INBOUND_ADD_SOURCES, INBOUND_INVALID_REASONS, INBOUND_LOST_REASONS, INVALID_NOTE_MIN, SELECTIONS } from '../../../constants/inbound';
import { InboundLead, InboundSource } from '../../../models/mock-data';
import { CRM_INBOUND_ID_PREFIX, Selection } from '../../../models/inbound';
import { isMobile } from '../../../models/outreach/handover';
import { newB2BId } from '../../../models/ids';
import { Field, GateErrors, LeadName, errorInputCls, inputCls } from '../../../ui/inbound-chips';
import { fetchInboundBoard, upsertInboundLead } from '@/lib/b2b';
import { normalisePhone } from '@/lib/org/utils';
import { useState } from 'react';

export function MoveModal({
  lead, target, onCancel, onDone,
}: {
  lead: InboundLead;
  target: InboundStatus;
  onCancel: () => void;
  onDone: (patch: Partial<InboundLead>) => void;
}) {
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate || '');
  const [followUpTime, setFollowUpTime] = useState(lead.followUpTime || '');
  const [enqId, setEnqId] = useState(lead.enqId || '');
  const [lostReason, setLostReason] = useState(lead.lostReason || '');
  const [invalidReason, setInvalidReason] = useState(lead.invalidReason || '');
  const [invalidNote, setInvalidNote] = useState(lead.invalidNote || '');
  const [touched, setTouched] = useState(false);

  const calls = lead.callAttempts?.length || 0;
  const errors = statusGateErrors({
    status: target, followUpDate, enqId, lostReason, invalidReason, invalidNote, calls,
    connected: hasConnected(lead.callAttempts), readiness: closureReadiness(lead),
  });
  const needsFollowUp = target === 'Follow up' || target === 'PI Shared';
  const needsEnq = target === 'PI Shared';
  const needsReason = target === 'Lost';
  const needsInvalid = target === 'Invalid';

  const commit = () => {
    if (errors.length) { setTouched(true); return; }
    onDone({
      stage: target,
      followUpDate: needsFollowUp ? followUpDate : lead.followUpDate,
      followUpTime: needsFollowUp ? followUpTime : lead.followUpTime,
      enqId: needsEnq ? enqId.trim() : lead.enqId,
      lostReason: needsReason ? lostReason : lead.lostReason,
      invalidReason: needsInvalid ? invalidReason : lead.invalidReason,
      invalidNote: needsInvalid ? invalidNote.trim() : lead.invalidNote,
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
            <LeadName lead={lead} />
            {lead.phone ? <span className="font-mono"> · {lead.phone}</span> : null}
            {' · '}{INBOUND_STATUS_HINT[target]}
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {needsFollowUp && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Next follow-up date" required error={touched ? errors.find((e) => e.includes('follow-up')) : undefined}>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className={touched && !followUpDate ? errorInputCls : inputCls}
                />
              </Field>
              <Field label="Time" hint="Optional">
                <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          {needsEnq && (
            <Field
              label="Enq ID"
              required
              error={touched ? errors.find((e) => e.includes('Enq ID')) : undefined}
              hint="Open the lead afterwards to pull the order value from the deal ticket."
            >
              <input
                value={enqId}
                onChange={(e) => setEnqId(e.target.value)}
                placeholder="ENQ-…"
                className={touched && !enqId.trim() ? errorInputCls : inputCls}
              />
            </Field>
          )}
          {needsReason && (
            <Field label="Lost reason" required error={touched ? errors.find((e) => /lost/i.test(e)) : undefined}>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className={touched && !lostReason ? errorInputCls : inputCls}
              >
                <option value="">Select a reason…</option>
                {INBOUND_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          {needsInvalid && !calls && (
            <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 leading-snug">
              No call is logged on this lead yet. Open it, call the number and log the attempt — a lead is only
              marked Invalid after someone has tried to qualify it.
            </p>
          )}
          {needsInvalid && calls > 0 && (
            <>
              <Field label="Why is it invalid?" required error={touched ? errors.find((e) => e.includes('invalid reason')) : undefined}>
                <select
                  value={invalidReason}
                  onChange={(e) => setInvalidReason(e.target.value)}
                  className={touched && !invalidReason ? errorInputCls : inputCls}
                >
                  <option value="">Select a reason…</option>
                  {INBOUND_INVALID_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field
                label="What did you check?"
                required
                error={touched ? errors.find((e) => e.includes('invalid note')) : undefined}
                hint={`At least ${INVALID_NOTE_MIN} characters — e.g. "Called twice, number belongs to a tile shop owner buying for his own flat".`}
              >
                <textarea
                  value={invalidNote}
                  onChange={(e) => setInvalidNote(e.target.value)}
                  rows={3}
                  className={touched && invalidNote.trim().length < INVALID_NOTE_MIN ? errorInputCls : inputCls}
                />
              </Field>
            </>
          )}
          {target === 'Closed' && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Open the lead afterwards to record <strong>Placed under</strong> and assign a KAM —
              neither blocks the move.
            </p>
          )}
          {touched && errors.length > 0 && <GateErrors errors={errors} />}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">
            Cancel
          </button>
          <button
            onClick={commit}
            disabled={needsInvalid && !calls}
            className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-40"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

export interface LeadOwnerOption { id: number; name: string }

const samePhone = (l: InboundLead, phone: string) =>
  [l.phone, l.primaryContactPhone].some((p) => normalisePhone(p) === phone);

export function AddLeadModal({ owners, defaultOwner, canPickOwner, loaded, boardOwnerIds, actorName, onCancel, onCreated, onOpenExisting }: {
  owners: LeadOwnerOption[];
  defaultOwner?: LeadOwnerOption;
  canPickOwner: boolean;
  loaded: InboundLead[];
  boardOwnerIds: number[];
  actorName: string;
  onCancel: () => void;
  onCreated: (lead: InboundLead) => void;
  onOpenExisting: (lead: InboundLead) => void;
}) {
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState<InboundSource | ''>('');
  const [requirement, setRequirement] = useState('');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [ownerId, setOwnerId] = useState<number | undefined>(defaultOwner?.id);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<InboundLead | null>(null);

  const owner = owners.find((o) => o.id === ownerId);
  const errors = [
    !contactName.trim() && 'Who is the contact?',
    !isMobile(phone) && 'A 10-digit mobile is required.',
    !company.trim() && 'A company name is required.',
    !source && 'Where did this lead come from?',
    !requirement.trim() && 'What do they need?',
    !owner && 'Pick who will work this lead.',
  ].filter(Boolean) as string[];
  const err = (bad: boolean) => (touched && bad ? errorInputCls : inputCls);
  const toggle = (c: Selection) => setSelections((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const submit = async () => {
    if (busy) return;
    if (errors.length) { setTouched(true); return; }
    const mobile = normalisePhone(phone);
    setBusy(true);
    setFailure(null);
    setDuplicate(null);
    let existing = loaded.find((l) => samePhone(l, mobile));
    if (!existing) {
      const found = await fetchInboundBoard({ page: 0, ownerIds: boardOwnerIds, search: mobile }).catch(() => null);
      if (!found?.ok) {
        setBusy(false);
        setFailure('Could not check Kylas and the CRM for this number, so nothing was added. Try again.');
        return;
      }
      existing = found.leads.find((l) => samePhone(l, mobile));
    }
    if (existing) { setBusy(false); setDuplicate(existing); return; }

    const at = new Date().toISOString();
    const lead: InboundLead = {
      id: newB2BId(CRM_INBOUND_ID_PREFIX.slice(0, -1)),
      phone: mobile,
      contactName: contactName.trim(),
      primaryContactName: contactName.trim(),
      primaryContactPhone: mobile,
      companyName: company.trim(),
      company: company.trim(),
      owner: owner!.name,
      ownerId: owner!.id,
      source: source as InboundSource,
      addedBy: actorName,
      leadCreatedAt: at,
      statusChangedAt: at,
      requirement: requirement.trim(),
      selections,
      stage: 'New',
      value: 0,
      callAttempts: [],
      calls: [],
    };
    const saveErr = await upsertInboundLead(lead);
    setBusy(false);
    if (saveErr) { setFailure(`Not added: ${saveErr}. Nothing was stored — try again.`); return; }
    onCreated(lead);
  };

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-[520px] mx-4 max-h-[92vh] overflow-y-auto">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-bold text-gray-900">Add an inbound lead</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            For a lead that reached us outside Kylas. It is kept in the CRM only and is never written to Kylas.
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contact name" required>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={err(!contactName.trim())} />
            </Field>
            <Field label="Mobile" required>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="10 digits" className={err(!isMobile(phone))} />
            </Field>
            <Field label="Company" required>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={err(!company.trim())} />
            </Field>
            <Field label="Where it came from" required>
              <select value={source} onChange={(e) => setSource(e.target.value as InboundSource)} className={err(!source)}>
                <option value="">Select…</option>
                {INBOUND_ADD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Requirement" required>
            <textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} rows={3} placeholder="What they need, for which project, how soon" className={err(!requirement.trim()) + ' resize-y'} />
          </Field>
          <Field label="Selection" hint="Optional">
            <div className="flex flex-wrap gap-1.5">
              {SELECTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${selections.includes(c) ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          {canPickOwner ? (
            <Field label="Owner" required>
              <select value={ownerId ?? ''} onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : undefined)} className={err(!owner)}>
                <option value="">Select…</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          ) : (
            <p className="text-[11px] text-gray-500">Owner: <span className="font-semibold text-gray-700">{owner?.name || '—'}</span> (you)</p>
          )}
          {duplicate && (
            <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 leading-snug">
              This number is already a lead: <strong>{duplicate.company || duplicate.contactName}</strong>, owned by
              {' '}{duplicate.owner || 'nobody'}, at {duplicate.stage}. Work that lead instead of adding a second one.
              {' '}<button onClick={() => onOpenExisting(duplicate)} className="font-semibold underline">Open it</button>
            </div>
          )}
          {failure && <p className="text-[11.5px] text-red-600">{failure}</p>}
          {touched && errors.length > 0 && <GateErrors errors={errors} />}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-40">
            {busy ? 'Checking…' : 'Add lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
