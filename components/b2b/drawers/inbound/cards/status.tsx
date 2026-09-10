'use client';

import { EnqLookup } from '../../../../../lib/b2b';
import { INBOUND_LOST_REASONS, INBOUND_STATUSES, INBOUND_STATUS_HINT } from '../../../constants/inbound';
import { InboundLead } from '../../../models/mock-data';
import { InboundStatus } from '../../../types/inbound';
import { Field, SectionCard, errorInputCls, inputCls } from '../../../ui/inbound-chips';
import { Dispatch, SetStateAction } from 'react';

export function InboundStatusCard({ checkEnq, draft, enq, enqChecking, gateFor, set, setDraft, setShowGates }: {
  checkEnq: (id?: string | undefined) => Promise<void>;
  draft: InboundLead;
  enq: EnqLookup | null;
  enqChecking: boolean;
  gateFor: (field: "followUpDate" | "enqId" | "lostReason") => string | undefined;
  set: <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;
  setDraft: Dispatch<SetStateAction<InboundLead>>;
  setShowGates: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <SectionCard title="Status" owner="crm" subtitle="§3.4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Status" hint={INBOUND_STATUS_HINT[draft.stage]}>
          <select
            value={draft.stage}
            onChange={(e) => { set('stage', e.target.value as InboundStatus); setShowGates(false); }}
            className={inputCls}
          >
            {INBOUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
    
        {(draft.stage === 'Follow up' || draft.stage === 'PI Shared') && (
          <>
            <Field label="Next follow-up date" required error={gateFor('followUpDate')}>
              <input
                type="date"
                value={draft.followUpDate || ''}
                onChange={(e) => set('followUpDate', e.target.value)}
                className={gateFor('followUpDate') ? errorInputCls : inputCls}
              />
            </Field>
            <Field label="Follow-up time" hint="Optional — orders the day's call list">
              <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
    
        {(draft.stage === 'PI Shared' || draft.stage === 'Closed') && (
          <>
            <Field
              label="Enq ID"
              required={draft.stage === 'PI Shared'}
              error={gateFor('enqId')}
              hint="The cart / ENQ number on the deal ticket"
            >
              <div className="flex items-center gap-1.5">
                <input
                  value={draft.enqId || ''}
                  onChange={(e) => set('enqId', e.target.value)}
                  onBlur={() => checkEnq()}
                  placeholder="ENQ-…"
                  className={(gateFor('enqId') ? errorInputCls : inputCls) + ' flex-1'}
                />
                <button
                  onClick={() => checkEnq()}
                  disabled={enqChecking || !(draft.enqId || '').trim()}
                  className="shrink-0 border border-gray-200 bg-white text-gray-600 px-2.5 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-40 hover:border-[#0F766E] hover:text-[#0F766E]"
                >
                  {enqChecking ? '…' : 'Fetch'}
                </button>
              </div>
            </Field>
    
            <Field
              label="Order value"
              owner={draft.orderValueSource === 'deal' ? 'deals' : 'crm'}
              hint={
                enq?.status === 'matched'
                  ? `From deal ticket ${draft.enqId}${enq.dealStatus ? ` · ${enq.dealStatus}` : ''}`
                  : enq?.status === 'unavailable'
                    ? 'Could not reach the deal system — this is not a wrong Enq ID.'
                    : enq?.status === 'no-match'
                      ? 'No deal ticket on this phone matches that Enq ID — enter the value yourself.'
                      : 'Press Fetch to pull it from the matching deal ticket.'
              }
            >
              <input
                type="number"
                min={0}
                value={draft.orderValue || ''}
                onChange={(e) => setDraft((d) => ({ ...d, orderValue: Number(e.target.value) || 0, orderValueSource: 'manual' }))}
                disabled={draft.orderValueSource === 'deal' && enq?.status === 'matched'}
                className={inputCls}
              />
            </Field>
    
            {enq?.status === 'no-match' && !!enq.available?.length && (
              <div className="sm:col-span-2">
                <p className="text-[10px] text-gray-500 mb-1">Enq IDs that do exist on {draft.phone}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {enq.available.slice(0, 8).map((id) => (
                    <button
                      key={id}
                      onClick={() => { set('enqId', id); checkEnq(id); }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 hover:bg-[#0F766E] hover:text-white"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {draft.orderValueSource === 'deal' && enq?.status === 'matched' && (
              <p className="sm:col-span-2 text-[10px] text-gray-400 -mt-1">
                Fetched from the deal ticket, so it cannot be typed over.{' '}
                <button onClick={() => set('orderValueSource', 'manual')} className="underline hover:text-gray-600">
                  Override manually
                </button>
              </p>
            )}
          </>
        )}
    
        {draft.stage === 'Lost' && (
          <Field label="Lost reason" required error={gateFor('lostReason')} className="sm:col-span-2">
            <select
              value={draft.lostReason || ''}
              onChange={(e) => set('lostReason', e.target.value)}
              className={gateFor('lostReason') ? errorInputCls : inputCls}
            >
              <option value="">Select a reason…</option>
              {INBOUND_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
    
              {draft.lostReason && !(INBOUND_LOST_REASONS as readonly string[]).includes(draft.lostReason) && (
                <option value={draft.lostReason}>{draft.lostReason} (previously recorded)</option>
              )}
            </select>
          </Field>
        )}
      </div>
    </SectionCard>
  );
}
