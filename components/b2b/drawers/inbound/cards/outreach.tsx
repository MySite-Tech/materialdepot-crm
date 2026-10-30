'use client';

import { useState } from 'react';

import { hasConnected, istDay, sentToOutreach } from '../../../models/inbound';
import { InboundLead } from '../../../models/mock-data';
import { OutreachReferral } from '../../../types/inbound';
import { Field, GateErrors, SectionCard, errorInputCls, fmtDay, inputCls } from '../../../ui/inbound-chips';

interface Draft {
  decisionMaker: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
  summary: string;
  interest: boolean;
}

const EMPTY: Draft = { decisionMaker: '', meetingDate: '', meetingTime: '', meetingLocation: '', summary: '', interest: false };

function referralErrors(d: Draft, today: string): string[] {
  const errs: string[] = [];
  if (!d.decisionMaker.trim()) errs.push('Name the decision maker and their role.');
  if (!d.meetingLocation.trim()) errs.push('Say where Outreach should meet them.');
  if (!d.meetingDate) errs.push('Pick the meeting date the client prefers.');
  else if (d.meetingDate < today) errs.push('The preferred meeting date is in the past.');
  if (!d.interest) errs.push('Confirm the client agreed to meet in person.');
  if (!d.summary.trim()) errs.push('Write the summary Outreach will read before the meeting.');
  return errs;
}

const callDigest = (l: InboundLead): string =>
  (l.callAttempts || [])
    .filter((a) => a.outcome === 'Connected' && a.note)
    .map((a) => `${istDay(a.at)} (${a.by || 'Inbound'}): ${a.note}`)
    .join('\n');

export function InboundOutreachCard({ draft, actorName, today, saving, onSend }: {
  draft: InboundLead;
  actorName: string;
  today: string;
  saving: boolean;
  onSend: (referral: OutreachReferral) => void;
}) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const r = draft.outreachReferral;

  if (sentToOutreach(draft) && r) {
    return (
      <SectionCard title="Outreach" owner="crm" subtitle="Handed to the field team">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
          <p className="sm:col-span-2 font-semibold text-[#0F766E]">Sent {fmtDay(istDay(r.at))} by {r.by}</p>
          <p><span className="text-gray-400">Decision maker</span> {r.decisionMaker}</p>
          <p><span className="text-gray-400">Meeting</span> {fmtDay(r.meetingDate)}{r.meetingTime ? ` · ${r.meetingTime}` : ''}</p>
          {r.meetingLocation && <p className="sm:col-span-2"><span className="text-gray-400">Where</span> {r.meetingLocation}</p>}
          {r.project && <p className="sm:col-span-2"><span className="text-gray-400">Project</span> {r.project}</p>}
          <p className="sm:col-span-2 text-gray-600 whitespace-pre-wrap">{r.summary || r.note}</p>
        </div>
        <p className="text-[10.5px] text-gray-400 mt-2">
          It now waits in Outreach’s From Inbound pool until a BM accepts it. It counts as qualified only after they do.
        </p>
      </SectionCard>
    );
  }

  const eligible = draft.stage !== 'New' && draft.stage !== 'Lost' && draft.stage !== 'Invalid';
  const connected = hasConnected(draft.callAttempts);
  const errors = referralErrors(d, today);
  const send = () => {
    if (errors.length) { setTouched(true); return; }
    onSend({
      decisionMaker: d.decisionMaker.trim(),
      meetingDate: d.meetingDate, meetingTime: d.meetingTime || undefined,
      meetingLocation: d.meetingLocation.trim(), summary: d.summary.trim(),
      at: new Date().toISOString(), by: actorName,
    });
  };
  const start = () => { setD({ ...EMPTY, summary: callDigest(draft) }); setOpen(true); };

  return (
    <SectionCard title="Outreach" owner="crm" subtitle="Hand a qualified lead to the field team to meet in person">
      {!eligible ? (
        <p className="text-[11.5px] text-gray-500">Only a lead you have worked, and that is not Lost or Invalid, can go to Outreach.</p>
      ) : !connected ? (
        <p className="text-[11.5px] text-gray-500">Log a Connected call first. Outreach only takes leads someone has actually spoken to.</p>
      ) : !open ? (
        <button onClick={start} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">
          Send to Outreach…
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Decision maker" required>
            <input value={d.decisionMaker} onChange={(e) => setD({ ...d, decisionMaker: e.target.value })}
              placeholder="Name, role" className={touched && !d.decisionMaker.trim() ? errorInputCls : inputCls} />
          </Field>
          <Field label="Meeting location" required hint="Where to meet — their office address lives under Client details">
            <input value={d.meetingLocation} onChange={(e) => setD({ ...d, meetingLocation: e.target.value })}
              placeholder="e.g. Their site in Whitefield" className={touched && !d.meetingLocation.trim() ? errorInputCls : inputCls} />
          </Field>
          <Field label="Preferred meeting date" required>
            <input type="date" min={today} value={d.meetingDate} onChange={(e) => setD({ ...d, meetingDate: e.target.value })}
              className={touched && (!d.meetingDate || d.meetingDate < today) ? errorInputCls : inputCls} />
          </Field>
          <Field label="Time" hint="Optional">
            <input type="time" value={d.meetingTime} onChange={(e) => setD({ ...d, meetingTime: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Summary for Outreach" required className="sm:col-span-2"
            hint="Started from your Connected calls. The full call log and team notes go across too.">
            <textarea rows={4} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })}
              placeholder="What they need, what was discussed, anything to watch for"
              className={touched && !d.summary.trim() ? errorInputCls : inputCls} />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-[12px] text-gray-700">
            <input type="checkbox" checked={d.interest} onChange={(e) => setD({ ...d, interest: e.target.checked })} />
            The client confirmed they want to meet in person
          </label>
          {touched && errors.length > 0 && <div className="sm:col-span-2"><GateErrors errors={errors} /></div>}
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button onClick={() => { setOpen(false); setTouched(false); }} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">
              Cancel
            </button>
            <button onClick={send} disabled={saving} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
              {saving ? 'Sending…' : 'Send and save lead'}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
