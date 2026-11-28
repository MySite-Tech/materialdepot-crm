'use client';

import { useEffect, useState } from 'react';
import { Empty, Field, ReadValue, SectionCard, inputCls } from '../../b2b/ui/inbound-chips';
import { CALL_OUTCOMES, COHORT_BY_KEY } from '@/lib/bda-retail/constants';
import type { CallOutcome, LeadView } from '@/lib/bda-retail/types';
import { istToday, rupees, shiftDays } from '@/lib/bda-retail/utils';
import { Notice, PriorityChip, StageChip } from './chips';

export function LeadDrawer({ lead, canCall, onClose, onCall, onRelease }: {
  lead: LeadView;
  canCall: boolean;
  onClose: () => void;
  onCall: (outcome: CallOutcome, note: string, followUpOn: string) => Promise<void>;
  onRelease?: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [note, setNote] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const picked = CALL_OUTCOMES.find((o) => o.key === outcome);
  const cohort = COHORT_BY_KEY[lead.cohort];
  const today = istToday();

  useEffect(() => {
    setOutcome('');
    setNote('');
    setFollowUpOn('');
    setError('');
    setSaved(false);
  }, [lead.key]);

  const submit = async () => {
    if (!picked || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCall(picked.key, note.trim(), picked.needsDate ? followUpOn : '');
      setOutcome('');
      setNote('');
      setFollowUpOn('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(`Could not save the call: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was stored.`);
    } finally {
      setSaving(false);
    }
  };

  const blocked = !picked || (picked.needsDate && !followUpOn) || (picked.connected && !note.trim());
  const notConnected = CALL_OUTCOMES.filter((o) => !o.connected);
  const connected = CALL_OUTCOMES.filter((o) => o.connected);

  const outcomeButton = (o: (typeof CALL_OUTCOMES)[number]) => (
    <button
      key={o.key}
      onClick={() => setOutcome(o.key)}
      className={`px-2.5 py-1.5 rounded-md border text-[12px] text-left ${outcome === o.key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
    >
      {o.label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 truncate">{lead.name || 'Unnamed customer'}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <a href={`tel:+91${lead.phone}`} className="text-[12px] font-mono text-[#0F766E] font-semibold">+91 {lead.phone}</a>
                <PriorityChip p={lead.priority} />
                <span className="text-[11px] text-gray-500">{cohort.label}</span>
                <StageChip stage={lead.stage} />
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <SectionCard title="Why they are in the bank" subtitle={cohort.group}>
            <p className="text-[13px] text-gray-800">{lead.detail}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">{cohort.rule}</p>
          </SectionCard>

          <SectionCard title="Customer">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Value"><ReadValue v={lead.value ? rupees(lead.value) : ''} /></Field>
              <Field label="Entered the bank"><ReadValue v={lead.enteredOn} /></Field>
              <Field label="Branch"><ReadValue v={lead.branch} /></Field>
              <Field label="BM on the cart"><ReadValue v={lead.bm} /></Field>
              <Field label="Enquiry / cart"><ReadValue v={lead.ref} /></Field>
              <Field label="Worked by"><ReadValue v={lead.claim ? lead.claim.by : 'Nobody yet'} /></Field>
            </div>
          </SectionCard>

          {lead.stage !== 'closed' && (
            <SectionCard title="Log a call" subtitle={canCall ? undefined : `${lead.claim?.by} is working this lead`}>
              {canCall ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Did not connect</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">{notConnected.map(outcomeButton)}</div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Connected</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{connected.map(outcomeButton)}</div>
                  </div>
                  {picked?.needsDate && (
                    <Field label="Follow up on" required>
                      <input type="date" min={today} max={shiftDays(today, 90)} value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className={inputCls} />
                    </Field>
                  )}
                  {picked && (
                    <Field label={picked.connected ? 'What did the customer say?' : 'Note'} required={picked.connected}>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} />
                    </Field>
                  )}
                  {error && <Notice tone="red">{error}</Notice>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={submit}
                      disabled={blocked || saving}
                      className="bg-[#0F766E] text-white px-4 py-2 rounded-md text-[12.5px] font-semibold disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save call'}
                    </button>
                    {saved && <span className="text-[12px] text-teal-700">Saved</span>}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500">Only the person working a lead logs its calls. A BDA Retail admin can return it to the shared queue.</p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Calls" subtitle={`${lead.calls.length} logged`}>
            {lead.calls.length === 0 && <Empty>No calls logged yet.</Empty>}
            <ol className="space-y-2">
              {[...lead.calls].reverse().map((c) => (
                <li key={c.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-gray-800">{CALL_OUTCOMES.find((o) => o.key === c.outcome)?.label}</span>
                    <span className="text-gray-400">{new Date(c.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <p className="text-gray-500">{c.by}{c.followUpOn ? ` · follow up ${c.followUpOn}` : ''}</p>
                  {c.note && <p className="mt-1 whitespace-pre-wrap text-gray-700">{c.note}</p>}
                </li>
              ))}
            </ol>
            {onRelease && lead.claim && lead.stage !== 'closed' && (
              <button onClick={() => void onRelease()} className="mt-3 text-[11.5px] text-gray-500 underline">Return to the shared queue</button>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
