'use client';

import { EnqLookup } from '@/lib/b2b';
import { INBOUND_INVALID_REASONS, INBOUND_LOST_REASONS, INBOUND_STATUSES, INBOUND_STATUS_HINT, INVALID_NOTE_MIN, LOST_REASON_NEEDS, isFollowUpStatus } from '../../../constants/inbound';
import { InboundLead, LeadDeal, fmtINR } from '../../../models/mock-data';
import { ClosureReadiness, InboundStatus } from '../../../types/inbound';
import { Empty, Field, SectionCard, Spinner, errorInputCls, fmtDay, inputCls } from '../../../ui/inbound-chips';
import { Loaded } from '../hooks/use-inbound-detail';
import { Dispatch, SetStateAction } from 'react';

export type GateField = 'followUpDate' | 'enqId' | 'lostReason' | 'invalidCalls' | 'invalidReason' | 'invalidNote';

export function InboundStatusCard({ checkEnq, draft, enq, enqChecking, gateFor, set, setDraft, setShowGates, deals, readiness, connected }: {
  checkEnq: (id?: string) => Promise<void>;
  draft: InboundLead;
  enq: EnqLookup | null;
  enqChecking: boolean;
  gateFor: (field: GateField) => string | undefined;
  set: <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;
  setDraft: Dispatch<SetStateAction<InboundLead>>;
  setShowGates: Dispatch<SetStateAction<boolean>>;
  deals: Loaded<LeadDeal[]>;
  readiness: ClosureReadiness;
  connected: boolean;
}) {
  const needsEnq = draft.stage === 'PI Shared' || draft.stage === 'Closed';
  const pick = (id: string) => { set('enqId', id); checkEnq(id); };
  const reasonOk = (r: string) => {
    const needs = LOST_REASON_NEEDS[r];
    return needs ? readiness.reason === needs : connected;
  };

  return (
    <SectionCard title="Status" owner="crm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Status" hint={INBOUND_STATUS_HINT[draft.stage]}>
          <select value={draft.stage} onChange={(e) => { set('stage', e.target.value as InboundStatus); setShowGates(false); }} className={inputCls}>
            {INBOUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        {isFollowUpStatus(draft.stage) && (
          <Field label="Next follow-up" error={gateFor('followUpDate')} hint="Set from the call log — log a call to change it.">
            <div className="px-3 py-2 rounded-md bg-gray-50 text-[13px] text-gray-700">
              {draft.followUpDate ? fmtDay(draft.followUpDate) : '—'}
            </div>
          </Field>
        )}

        {needsEnq && (
          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {draft.stage === 'PI Shared' ? 'Which PI?' : 'Which order?'}<span className="text-red-500 ml-0.5">{draft.stage === 'PI Shared' ? '*' : ''}</span>
              <span className="normal-case tracking-normal font-normal"> — this client&apos;s deal tickets, by mobile</span>
            </span>
            {deals.loading ? <Spinner label="Loading deal tickets…" />
              : deals.data.length === 0 ? <Empty>No deal ticket on this client&apos;s numbers yet. Type the Enq ID below if it sits on another number.</Empty>
                : (
                  <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-md max-h-[220px] overflow-y-auto">
                    {deals.data.map((d) => {
                      const on = (draft.enqId || '').trim() === d.id;
                      return (
                        <button key={d.ticketId ?? d.id} onClick={() => pick(d.id)}
                          className={`text-left px-3 py-2 flex items-center justify-between gap-2 ${on ? 'bg-[#0F766E]/8' : 'hover:bg-gray-50'}`}>
                          <span className="min-w-0">
                            <span className="text-[12px] font-mono font-semibold text-gray-800">{d.id}</span>
                            {on && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-[#0F766E]">selected</span>}
                            <span className="block text-[10px] text-gray-400 truncate">{[d.status, d.branch, d.assignedTo, d.createdAt].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="text-[12px] font-mono text-gray-700 whitespace-nowrap">{d.cartValue ? fmtINR(d.cartValue) : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Enq ID" error={gateFor('enqId')} hint="Picked above, or typed if the ticket is on another number">
                <div className="flex items-center gap-1.5">
                  <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} onBlur={() => checkEnq()} placeholder="ENQ-…"
                    className={(gateFor('enqId') ? errorInputCls : inputCls) + ' flex-1'} />
                  <button onClick={() => checkEnq()} disabled={enqChecking || !(draft.enqId || '').trim()}
                    className="shrink-0 border border-gray-200 bg-white text-gray-600 px-2.5 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-40 hover:border-[#0F766E] hover:text-[#0F766E]">
                    {enqChecking ? '…' : 'Fetch'}
                  </button>
                </div>
              </Field>
              <Field
                label="Order value"
                owner={draft.orderValueSource === 'deal' ? 'deals' : 'crm'}
                hint={enq?.status === 'matched' ? `From deal ticket ${draft.enqId}${enq.dealStatus ? ` · ${enq.dealStatus}` : ''}`
                  : enq?.status === 'unavailable' ? 'Could not reach the deal system — this is not a wrong Enq ID.'
                    : enq?.status === 'no-match' ? 'No deal ticket carries that Enq ID — enter the value yourself.'
                      : 'Filled from the deal ticket once an Enq ID is picked.'}
              >
                <input type="number" min={0} value={draft.orderValue || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, orderValue: Number(e.target.value) || 0, orderValueSource: 'manual' }))}
                  disabled={draft.orderValueSource === 'deal' && enq?.status === 'matched'} className={inputCls} />
              </Field>
            </div>
            {enq?.status === 'matched' && enq.otherPhone && (
              <p className="text-[10.5px] text-amber-700 leading-snug">
                That ticket is raised on <span className="font-mono">{enq.otherPhone}</span>, not this client&apos;s number. Check it is the same client before saving.
              </p>
            )}
            {draft.orderValueSource === 'deal' && enq?.status === 'matched' && (
              <p className="text-[10px] text-gray-400">
                Fetched from the deal ticket, so it cannot be typed over.{' '}
                <button onClick={() => set('orderValueSource', 'manual')} className="underline hover:text-gray-600">Override manually</button>
              </p>
            )}
          </div>
        )}

        {draft.stage === 'Lost' && (
          <Field label="Why was it lost?" required error={gateFor('lostReason')} className="sm:col-span-2"
            hint={readiness.ready ? undefined : connected ? 'Unreachable and No progress unlock when the call log says so.' : 'Log a Connected call before giving a reason the client told you.'}>
            <select value={draft.lostReason || ''} onChange={(e) => set('lostReason', e.target.value)} className={gateFor('lostReason') ? errorInputCls : inputCls}>
              <option value="">Select a reason…</option>
              {INBOUND_LOST_REASONS.map((r) => <option key={r} value={r} disabled={!reasonOk(r)}>{r}{reasonOk(r) ? '' : ' (not yet)'}</option>)}
              {draft.lostReason && !(INBOUND_LOST_REASONS as readonly string[]).includes(draft.lostReason) && (
                <option value={draft.lostReason}>{draft.lostReason} (previously recorded)</option>
              )}
            </select>
          </Field>
        )}

        {draft.stage === 'Invalid' && (
          <>
            {gateFor('invalidCalls') && (
              <p className="sm:col-span-2 text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 leading-snug">
                {gateFor('invalidCalls')} Use <strong>RNR</strong> or <strong>Connected</strong> in the call log above.
              </p>
            )}
            <Field label="Why is it junk / disqualified?" required error={gateFor('invalidReason')} className="sm:col-span-2">
              <select value={draft.invalidReason || ''} onChange={(e) => set('invalidReason', e.target.value)} className={gateFor('invalidReason') ? errorInputCls : inputCls}>
                <option value="">Select a reason…</option>
                {INBOUND_INVALID_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="What did you check?" required error={gateFor('invalidNote')} className="sm:col-span-2"
              hint={`At least ${INVALID_NOTE_MIN} characters. Managers read these to judge lead quality.`}>
              <textarea value={draft.invalidNote || ''} onChange={(e) => set('invalidNote', e.target.value)} rows={3}
                placeholder="e.g. Called twice, number belongs to a homeowner buying for one flat"
                className={gateFor('invalidNote') ? errorInputCls : inputCls} />
            </Field>
          </>
        )}
      </div>
    </SectionCard>
  );
}
