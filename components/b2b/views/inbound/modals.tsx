'use client';

import { INBOUND_STATUS_HINT, InboundStatus, statusGateErrors } from '../../models/inboundModel';
import { InboundLead } from '../../models/mockData';
import { Field, GateErrors, LeadName, errorInputCls, inputCls } from '../../ui/inboundChips';
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
  const [touched, setTouched] = useState(false);

  const errors = statusGateErrors({ status: target, followUpDate, enqId, lostReason });
  const needsFollowUp = target === 'Follow up' || target === 'PI Shared';
  const needsEnq = target === 'PI Shared';
  const needsReason = target === 'Lost';

  const commit = () => {
    if (errors.length) { setTouched(true); return; }
    onDone({
      stage: target,
      followUpDate: needsFollowUp ? followUpDate : lead.followUpDate,
      followUpTime: needsFollowUp ? followUpTime : lead.followUpTime,
      enqId: needsEnq ? enqId.trim() : lead.enqId,
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
            <Field label="Lost reason" required error={touched ? errors.find((e) => e.includes('lost reason')) : undefined}>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className={touched && !lostReason ? errorInputCls : inputCls}
              >
                <option value="">Select a reason…</option>
                {['Selection Not Liked', 'Price Issue', 'Timeline/Delivery Delay', 'Unreachable (4 attempts)', 'Enquiry invalid']
                  .map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
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
          <button onClick={commit} className="px-3.5 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
