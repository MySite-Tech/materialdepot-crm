'use client';

import { OutreachLead } from '../../../models/mock-data';
import {
  HANDOVER_STATE_COLOR, HANDOVER_STATE_LABEL, HANDOVER_TAT_HOURS, handoverGateErrors, handoverPrompts, handoverState,
  hoursSince, isWhatsappGroupLink,
} from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import EcPicker from '../../../ui/ec-picker';
import { Field, Pill, SectionCard, errorInputCls } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';
import { Dispatch, SetStateAction, useState } from 'react';

const HANDOVER_REJECT_REASONS = [
  'Payload incomplete — details missing',
  'WhatsApp group not set up or I am not in it',
  'Not actually converted — no order found',
  'Wrong KAM / region',
] as const;

export function OutreachHandoverCard({ draft, saved, kams, canRespond, nowMs, busy, kamLoad, onAutoKam, onSend, onRespond, set, setDraft }: {
  draft: OutreachLead;
  saved: OutreachLead;
  kams: Rep[];
  canRespond: boolean;
  nowMs: number;
  busy: boolean;
  kamLoad: Record<string, number> | null;
  onAutoKam: () => Promise<string | null>;
  onSend: (kam: Rep) => void;
  onRespond: (accept: boolean, reason?: string) => void;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  setDraft: Dispatch<SetStateAction<OutreachLead>>;
}) {
  const [kamName, setKamName] = useState(saved.handover?.kam || draft.kam || '');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const state = handoverState(saved, nowMs);
  const missing = handoverGateErrors(draft);
  const prompts = draft.status === 'Closed' ? handoverPrompts(draft) : [];
  const h = saved.handover;
  const linkBad = !!draft.whatsappGroupLink && !isWhatsappGroupLink(draft.whatsappGroupLink);
  const canSend = draft.status === 'Closed' && !missing.length && !!kamName && (state === 'ready' || state === 'rejected');
  const kam = kams.find((k) => k.name === kamName) || { name: kamName };

  return (
    <SectionCard
      title="KAM handover"
      owner="crm"
      subtitle={`Round-robin to a KAM once converted · KAM signs off within ${HANDOVER_TAT_HOURS}h`}
      right={<Pill color={HANDOVER_STATE_COLOR[state]}>{HANDOVER_STATE_LABEL[state]}</Pill>}
    >
      <Field
        label="WhatsApp group link"
        required={draft.status === 'Closed'}
        hint="The group with the client, you and the KAM. Required for the handover."
        error={linkBad ? 'That is not a WhatsApp group invite link (https://chat.whatsapp.com/…).' : undefined}
      >
        <div className="flex items-center gap-1.5">
          <input value={draft.whatsappGroupLink || ''} onChange={(e) => set('whatsappGroupLink', e.target.value.trim() || undefined)}
            placeholder="https://chat.whatsapp.com/…" className={linkBad ? errorInputCls : inputCls} />
          {isWhatsappGroupLink(draft.whatsappGroupLink) && (
            <a href={draft.whatsappGroupLink} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[#0F766E] whitespace-nowrap hover:underline">Open</a>
          )}
        </div>
      </Field>

      {draft.status !== 'Closed' ? (
        <p className="mt-3 text-[11.5px] text-gray-500 leading-snug">
          Outreach ends when the first order is placed. Move the lead to <strong>Converted</strong> and the handover opens here.
        </p>
      ) : (
        <>
          {h && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/70 px-3 py-2 text-[11.5px] text-gray-700 leading-snug">
              {`Sent to ${h.kam} by ${h.sentBy} on ${h.sentAt.slice(0, 10)}`}
              {h.status === 'Pending' && ` · ${Math.floor(hoursSince(h.sentAt, nowMs))}h waiting`}
              {h.respondedAt && ` · ${h.status === 'Accepted' ? 'signed off' : 'rejected'} by ${h.respondedBy} on ${h.respondedAt.slice(0, 10)}`}
              {h.rejectReason && <div className="text-red-700 mt-0.5">{`Reason: ${h.rejectReason}`}</div>}
            </div>
          )}

          {(state === 'ready' || state === 'rejected') && (
            <>
              <div className="mt-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Handover must carry</span>
                {missing.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {missing.map((m) => <li key={m} className="text-[11.5px] text-red-600">✗ {m}</li>)}
                  </ul>
                ) : <p className="text-[11.5px] text-green-700">✓ Everything the KAM needs is filled in.</p>}
                {prompts.map((p) => <p key={p} className="text-[11px] text-amber-700 mt-0.5">• {p}</p>)}
              </div>
              <div className="mt-3 flex items-end gap-2 flex-wrap">
                <Field label="KAM" className="min-w-[180px]">
                  <select value={kamName} onChange={(e) => setKamName(e.target.value)} className={inputCls}>
                    <option value="">Pick a KAM</option>
                    {kams.map((k) => <option key={k.phone || k.name} value={k.name}>{k.name}</option>)}
                  </select>
                </Field>
                <button
                  onClick={async () => { const pick = await onAutoKam(); if (pick) setKamName(pick); }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-gray-200 bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
                >
                  Round-robin
                </button>
                <button
                  disabled={!canSend || busy}
                  onClick={() => onSend(kam)}
                  className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-40"
                >
                  {busy ? 'Sending…' : state === 'rejected' ? 'Resend handover' : 'Send handover'}
                </button>
              </div>
              {kamLoad && (
                <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                  {`Round-robin picks the KAM holding the fewest converted leads across Inbound and Outreach — ${Object.entries(kamLoad).map(([k, n]) => `${k} ${n}`).join(', ') || 'nobody has any yet'}.`}
                </p>
              )}
            </>
          )}

          {canRespond && (state === 'pending' || state === 'overdue') && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2.5">
              <p className="text-[11.5px] text-gray-700 leading-snug mb-2">
                Sign off only once you have read the meeting history, joined the WhatsApp group and agreed your first meeting with the owner.
              </p>
              {rejecting ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="px-2 py-1 text-[11.5px] border border-gray-200 rounded-md bg-white">
                    <option value="">Why?</option>
                    {HANDOVER_REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button disabled={!reason || busy} onClick={() => onRespond(false, reason)} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-red-600 text-white disabled:opacity-40">Reject</button>
                  <button onClick={() => setRejecting(false)} className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-gray-200 bg-white text-gray-500">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button disabled={busy} onClick={() => onRespond(true)} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-40">Accept handover</button>
                  <button onClick={() => setRejecting(true)} className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-gray-200 bg-white text-gray-600">Reject…</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-gray-100">
        <Field label="Spok" hint="Whoever is speaking to this lead — shown on the Leads tab">
          <input value={draft.spok || ''} onChange={(e) => set('spok', e.target.value)} placeholder={draft.bm} className={inputCls} />
        </Field>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Assisted at EC</span>
          <EcPicker ecName={draft.ecName} ecBmName={draft.ecBmName} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        </div>
      </div>
    </SectionCard>
  );
}
