'use client';

import { ClientEntity, primaryContact } from '../../models/clientModel';
import { KAM_ORDER_LOST_REASONS, KAM_ORDER_STATUSES, KAM_ORDER_STATUS_HINT, KamOrder, KamOrderStatus, kamOrderGateErrors, kamOrderStatusPrompts } from '../../models/kamModel';
import { fmtINR } from '../../models/mockData';
import { LostReasonSelect } from '../../ui/exportUtils';
import { Field } from './ui';
import { btnGhost, btnPrimary, inputCls } from '../../utils/kams';
import { lookupEnqId } from '@/lib/b2bLeads';
import { useState } from 'react';

export function OrderModal({ order, isNew, clients, kam, onClose, onSave }: {
  order: KamOrder;
  isNew?: boolean;
  clients: ClientEntity[];
  kam: string;
  onClose: () => void;
  onSave: (o: KamOrder) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<KamOrder>(order);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'matched' | 'no-match' | 'unavailable'; note?: string; available?: string[] }>({ state: 'idle' });

  const set = <K extends keyof KamOrder>(k: K, v: KamOrder[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = kamOrderGateErrors(draft);
  const prompts = kamOrderStatusPrompts(draft);

  const pickClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const primary = primaryContact(c.contacts);
    setDraft((d) => ({
      ...d,
      clientId: c.id,
      company: c.company,
      contactName: primary?.name,
      phone: primary?.number,
      source: c.source,

      kam: c.kam || d.kam,
    }));
  };

  const runLookup = async () => {
    const enq = String(draft.enqId || '').trim();
    if (!enq || !draft.phone) {
      setLookup({ state: 'no-match', note: 'An Enquiry ID and a contact number are both needed to look one up.' });
      return;
    }
    setLookup({ state: 'busy' });
    const r = await lookupEnqId(draft.phone, enq);
    if (r.status === 'matched') {
      setDraft((d) => ({
        ...d,
        orderValue: r.orderValue,
        orderValueSource: 'deal',
        dealStatus: r.dealStatus,
        value: Number(r.orderValue) || 0,
      }));
      setLookup({ state: 'matched', note: `${fmtINR(r.orderValue || 0)} · ${r.dealStatus || 'no status'}${r.bmName ? ` · ${r.bmName}` : ''}` });
    } else if (r.status === 'unavailable') {
      setLookup({ state: 'unavailable', note: 'Procurement could not be reached. That is not evidence the Enquiry ID is wrong — try again.' });
    } else {
      setLookup({ state: 'no-match', available: r.available });
    }
  };

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setError('');
    const statusChanged = draft.status !== order.status;
    const err = await onSave({
      ...draft,

      value: Number(draft.orderValue) || 0,
      statusChangedAt: statusChanged || isNew ? new Date().toISOString() : draft.statusChangedAt,
      createdAt: draft.createdAt || new Date().toISOString(),
      kam: draft.kam || kam,
    });
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[580px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">{isNew ? 'Add Order' : draft.company}</h2>
            <p className="text-[11px] text-gray-400">KAM PRD §5.1</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Company name" hint="Your assigned clients only — §5.1. Add the client in the Client Database first if it is not here.">
            {isNew ? (
              <select value={draft.clientId || ''} onChange={(e) => pickClient(e.target.value)} className={inputCls}>
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company}{c.kam ? ` · ${c.kam}` : ''}</option>)}
              </select>
            ) : (
              <div className="text-[13px] font-semibold text-gray-800">
                {draft.company}
                <span className="text-[11px] text-gray-400 font-normal"> · {draft.phone || 'no number'}</span>
              </div>
            )}
          </Field>

          {!isNew && !draft.clientId && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              This order pre-dates the Client Database and is not linked to a client entity, so it does not appear in
              that client&apos;s Active Orders list. Add the client to the Client Database with this number
              ({draft.phone || 'none on file'}) and the link forms on the next seed.
            </p>
          )}

          <Field label="Requirement details">
            <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="What the client needs" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Order value (your estimate)" hint="Never reported as revenue — §5.1.">
              <input type="number" min={0} value={draft.estimatedValue ?? ''} onChange={(e) => set('estimatedValue', Number(e.target.value) || undefined)} className={inputCls} />
            </Field>
            <Field label="Expected date of closure">
              <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value || undefined)} className={inputCls} />
            </Field>
          </div>

          <Field label="Status" hint={KAM_ORDER_STATUS_HINT[draft.status]}>
            <select value={draft.status} onChange={(e) => set('status', e.target.value as KamOrderStatus)} className={inputCls}>
              {KAM_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {draft.legacyStage && (
            <p className="text-[10px] text-gray-400">
              Stored on this row as “{draft.legacyStage}” by the old board; shown as {draft.status}. Saving rewrites it.
            </p>
          )}

          <Field label={`Enquiry ID${draft.status === 'PI Shared' ? ' *' : ''}`} hint="§5.2 requires this at PI Shared, and it is what fetches the order value.">
            <div className="flex gap-1.5">
              <input value={draft.enqId || ''} onChange={(e) => { set('enqId', e.target.value); setLookup({ state: 'idle' }); }} className={inputCls + ' font-mono'} placeholder="ENQ2026…" />
              <button onClick={runLookup} disabled={lookup.state === 'busy'} className={btnGhost + ' whitespace-nowrap'}>
                {lookup.state === 'busy' ? 'Looking…' : 'Fetch value'}
              </button>
            </div>
          </Field>

          {lookup.state === 'matched' && <p className="text-[11px] text-[#0F766E]">Matched · {lookup.note}</p>}
          {lookup.state === 'unavailable' && <p className="text-[11px] text-blue-700">{lookup.note}</p>}
          {lookup.state === 'no-match' && (
            <p className="text-[11px] text-amber-800">
              {lookup.note || `No deal ticket on ${draft.phone} has that exact Enquiry ID.`}
              {!!lookup.available?.length && <> Enquiry IDs on this number: <span className="font-mono">{lookup.available.slice(0, 6).join(', ')}</span>.</>}
              {' '}Matching is exact on purpose — resolving a near-miss would attach another client&apos;s money to this order.
            </p>
          )}

          <Field label="Order value (Procurement)" hint="Read from the deal ticket. The only figure counted as revenue.">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-bold text-gray-800">
                {draft.orderValue !== undefined ? fmtINR(draft.orderValue) : <span className="text-gray-300 font-normal text-[12px]">not fetched</span>}
              </span>
              {draft.orderValueSource && <span className="text-[10px] text-gray-400">from {draft.orderValueSource === 'deal' ? 'the deal ticket' : 'a manual entry'}</span>}
              {draft.dealStatus && <span className="text-[10px] text-gray-400">· {draft.dealStatus}</span>}
              {draft.orderValue !== undefined && (
                <button onClick={() => setDraft((d) => ({ ...d, orderValue: undefined, orderValueSource: undefined, dealStatus: undefined, value: 0 }))}
                  className="text-[10px] font-semibold text-gray-400 hover:underline cursor-pointer">clear</button>
              )}
            </div>
          </Field>

          {draft.status === 'Lost' && (
            <Field label="Lost reason *">
              <LostReasonSelect
                value={draft.lostReason || ''}
                options={KAM_ORDER_LOST_REASONS}
                onChange={(v) => set('lostReason', v || undefined)}
                className={inputCls}
              />
            </Field>
          )}

          {!!errors.length && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {!errors.length && !!prompts.length && (
            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
              {prompts.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length} className={btnPrimary}>
            {saving ? 'Saving…' : isNew ? 'Add order' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
