'use client';

import { EnqLookup } from '@/lib/b2b';
import { INBOUND_INVALID_REASONS, INBOUND_LOST_REASONS, INBOUND_STATUSES, INBOUND_STATUS_HINT, INVALID_NOTE_MIN, LOST_REASON_NEEDS, isFollowUpStatus } from '../../../constants/inbound';
import { InboundLead, LeadDeal, fmtINR } from '../../../models/mock-data';
import { ClosureReadiness, InboundStatus } from '../../../types/inbound';
import { Empty, Field, SectionCard, Spinner, errorInputCls, fmtDay, inputCls } from '../../../ui/inbound-chips';
import { fmtFollowUp } from '../../../models/reminders';
import { Loaded } from '../hooks/use-inbound-detail';
import { Dispatch, SetStateAction, useState } from 'react';
import { DealInline } from '../../../ui/deal-detail';
import { dealIsOpen } from '../../../models/client';

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
  const tickets = [...deals.data].sort((a, b) => Number(dealIsOpen(b.status)) - Number(dealIsOpen(a.status)));
  const openCount = tickets.filter((d) => dealIsOpen(d.status)).length;
  const [viewing, setViewing] = useState<string | null>(null);
  const reasonOk = (r: string) => {
    const needs = LOST_REASON_NEEDS[r];
    return needs ? readiness.reason === needs : connected;
  };

  return (
    <>
    <SectionCard title="Status">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Status" info={INBOUND_STATUS_HINT[draft.stage]}>
          <select value={draft.stage} onChange={(e) => { set('stage', e.target.value as InboundStatus); setShowGates(false); }} className={inputCls}>
            {INBOUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        {isFollowUpStatus(draft.stage) && (
          <Field label="Next follow-up" error={gateFor('followUpDate')} info="Set from the call log. Log a call on Activity to change it.">
            <div className="px-2.5 py-1.5 rounded-md bg-gray-50 text-[12px] text-gray-700">
              {draft.followUpDate ? fmtFollowUp(draft.followUpDate, draft.followUpTime) : '—'}
            </div>
          </Field>
        )}

        {needsEnq && (
          <div className="sm:col-span-2 flex flex-col gap-2">
            <p className="text-[11.5px] text-gray-500">
              {draft.stage === 'PI Shared' ? 'Which PI?' : 'Which order?'}{draft.stage === 'PI Shared' && <span className="text-red-500">*</span>} Use a deal ticket under Carts and PIs below, or type the Enq ID.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Enq ID" error={gateFor('enqId')} info="Picked below, or typed if the ticket is on another number.">
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

    <SectionCard
      title="Carts and PIs"
      owner="deals"
      subtitle={deals.loading ? 'loading…' : deals.failed ? '' : `${openCount} open of ${tickets.length}`}
      info="Every deal ticket on this client's numbers: the Kylas number, the primary person and everyone added. Open ones first. Click one to show its products and full detail under it."
    >
      {deals.loading ? <Spinner label="Loading deal tickets…" />
        : deals.failed ? <p className="text-[12px] text-amber-700">The deal tickets did not load, so carts and PIs are unknown here. This is not an empty list.</p>
          : tickets.length === 0 ? <Empty>No cart or PI on this client&apos;s numbers yet.</Empty>
            : (
              <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-md">
                {tickets.map((d) => {
                  const on = (draft.enqId || '').trim() === d.id;
                  const open = dealIsOpen(d.status);
                  const shown = viewing === d.id;
                  return (
                    <div key={d.ticketId ?? d.id}>
                    <div className={`flex items-center gap-2 pr-3 ${on ? 'bg-[#0F766E]/[0.06]' : ''}`}>
                      <button onClick={() => setViewing(shown ? null : d.id)} aria-expanded={shown} className="flex-1 min-w-0 text-left pl-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50 rounded-md">
                        <span className="min-w-0">
                          <span className="text-[12px] font-mono font-medium text-gray-800">{d.id}</span>
                          <span className={`ml-2 text-[10.5px] font-medium rounded px-1 ${open ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{d.status}</span>
                          {on && <span className="ml-1.5 text-[10.5px] font-medium text-[#0F766E]">picked</span>}
                          <span className="block text-[11px] text-gray-400 truncate">{[d.branch, d.assignedTo, d.createdAt && `opened ${fmtDay(d.createdAt)}`].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="text-[12px] font-mono text-gray-700 whitespace-nowrap">{d.cartValue ? fmtINR(d.cartValue) : '—'}<span className="ml-1.5 text-gray-400">{shown ? '▴' : '▾'}</span></span>
                      </button>
                      {needsEnq && !on && (
                        <button onClick={() => pick(d.id)} className="shrink-0 text-[11.5px] font-medium text-[#0F766E] hover:underline whitespace-nowrap">Use as Enq ID</button>
                      )}
                    </div>
                    {shown && <div className="px-2 pb-2"><DealInline enqId={d.id} /></div>}
                    </div>
                  );
                })}
              </div>
            )}
    </SectionCard>
    </>
  );
}
