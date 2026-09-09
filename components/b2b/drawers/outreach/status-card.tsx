'use client';

import { EnqLookup } from '../../../../lib/b2bLeads';
import { LeadDeal, OutreachLead, OutreachStatus, fmtINR } from '../../models/mockData';
import { OUTREACH_LOST_REASONS, OUTREACH_STATUSES, OUTREACH_STATUS_HINT } from '../../models/outreachModel';
import { LostReasonSelect } from '../../ui/exportUtils';
import { Field, GateErrors, SectionCard, errorInputCls } from '../../ui/inboundChips';
import { inputCls } from '../../utils/kams';
import { Dispatch, SetStateAction } from 'react';

export function OutreachStatusCard({ checkEnq, draft, enq, enqChecking, enqDeal, gateErrors, gateFor, prompts, set, setDraft, showGates }: {
  checkEnq: (id?: string | undefined) => Promise<void>;
  draft: OutreachLead;
  enq: EnqLookup | null;
  enqChecking: boolean;
  enqDeal: LeadDeal | undefined;
  gateErrors: string[];
  gateFor: (field: "followUpDate" | "lostReason") => string | undefined;
  prompts: string[];
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  setDraft: Dispatch<SetStateAction<OutreachLead>>;
  showGates: boolean;
}) {
  return (
    <SectionCard title="Status" owner="crm" subtitle={OUTREACH_STATUS_HINT[draft.status]}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Status" required>
          <select value={draft.status} onChange={(e) => set('status', e.target.value as OutreachStatus)} className={inputCls}>
            {OUTREACH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        {(draft.status === 'Follow up' || draft.status === 'PI Shared' || draft.status === 'Quote Share') && (
          <>
            <Field
              label="Next follow-up"
              required={draft.status !== 'Quote Share'}
              error={gateFor('followUpDate')}
              hint={draft.status === 'Quote Share' ? 'Optional on Quote Share' : undefined}
            >
              <input
                type="date"
                value={draft.followUpDate || ''}
                onChange={(e) => set('followUpDate', e.target.value)}
                className={gateFor('followUpDate') ? errorInputCls : inputCls}
              />
            </Field>
            <Field label="Time" hint="Optional">
              <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
      </div>
    
      {(draft.status === 'PI Shared' || draft.status === 'Closed') && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">From Procurement</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Deals</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Enq ID" hint="Matched exactly against the deal tickets on this number">
              <div className="flex items-center gap-1.5">
                <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} placeholder="ENQ-…" className={inputCls} />
                <button
                  onClick={() => checkEnq()}
                  disabled={enqChecking || !draft.enqId?.trim()}
                  className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap disabled:opacity-50"
                >
                  {enqChecking ? '…' : 'Fetch'}
                </button>
              </div>
            </Field>
            <Field
              label="Order value (₹)"
              hint={draft.orderValueSource === 'deal'
                ? 'Fetched from the matched deal ticket'
                : draft.orderValueSource === 'manual'
                  ? 'Typed by hand — no ticket matched this Enq ID'
                  : undefined}
            >
              <input
                type="number"
                min={0}
                value={draft.orderValue ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, orderValue: Number(e.target.value) || undefined, orderValueSource: 'manual' }))}
                className={inputCls}
              />
            </Field>
          </div>
    
          {enq?.status === 'matched' && (
            <div className="mt-2.5 rounded-md border border-[#0F766E]/25 bg-[#0F766E]/5 px-3 py-2 text-[11.5px] text-gray-700 leading-snug">
              Matched ticket <strong>{draft.enqId}</strong> — {fmtINR(enq.orderValue || 0)}
              {enq.dealStatus ? ` · ${enq.dealStatus}` : ''}
              {enq.bmName ? ` · assigned to ${enq.bmName}` : ''}
              {enq.branch ? ` · ${enq.branch}` : ''}
              {enqDeal?.cartItems && <div className="text-gray-500 mt-1">{enqDeal.cartItems}</div>}
            </div>
          )}
          {enq?.status === 'no-match' && (
            <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 leading-snug">
              No deal ticket on this number carries that Enq ID exactly, so nothing was fetched —
              type the value if you have it.
              {enq.available?.length
                ? <> Tickets on this number: <span className="font-mono">{enq.available.join(', ')}</span>.</>
                : ' This number has no deal tickets at all.'}
            </div>
          )}
          {enq?.status === 'unavailable' && (
            <div className="mt-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700 leading-snug">
              The deal system did not answer. That is not evidence your Enq ID is wrong — try the
              fetch again in a moment.
            </div>
          )}
        </div>
      )}
    
      {draft.status === 'Lost' && (
        <Field label="Lost reason" required error={gateFor('lostReason')} className="mt-4 pt-4 border-t border-gray-100">
          <LostReasonSelect
            value={draft.lostReason || ''}
            options={OUTREACH_LOST_REASONS}
            onChange={(v) => set('lostReason', v)}
            className={gateFor('lostReason') ? errorInputCls : inputCls}
          />
        </Field>
      )}
    
      {showGates && gateErrors.length > 0 && <div className="mt-3"><GateErrors errors={gateErrors} /></div>}
      {prompts.length > 0 && (
        <ul className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex flex-col gap-1">
          {prompts.map((p) => (
            <li key={p} className="text-[11px] text-amber-800 leading-snug">• {p}</li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
