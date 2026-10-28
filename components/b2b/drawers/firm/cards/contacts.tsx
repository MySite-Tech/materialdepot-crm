'use client';

import { CONTACT_LABELS } from '../constants';
import { firmHolding, fmtPhone } from '../utils';
import { ClientContact, ClientEntity, contactLabel, isValidContactNumber, normalizeContactNumber } from '../../../models/client';
import { fmtShortINR } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { ClientOrderHistory } from '@/lib/b2b';
import { useState } from 'react';

export function ContactsCard({ client, clients, historyFor, via, onVia, onSave }: {
  client: ClientEntity;
  clients: ClientEntity[];
  historyFor: (phone: string) => ClientOrderHistory | undefined;
  via: string | null;
  onVia: (phone: string | null) => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ClientContact>({ number: '' });
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const contacts = (client.contacts || []).filter((c) => normalizeContactNumber(c.number));
  const typed = normalizeContactNumber(draft.number);
  const holder = typed.length === 10 ? firmHolding(clients, client.id, { phone: typed }) : undefined;
  const draftError = !String(draft.number).trim() ? ''
    : !isValidContactNumber(draft.number) ? 'Not a valid 10-digit Indian mobile number.'
    : contacts.some((c) => normalizeContactNumber(c.number) === typed) ? 'This number is already on this firm.'
    : holder ? `Already on ${holder.company || 'another firm'}. If they are one business, merge the two firms instead.`
    : '';

  const write = async (next: ClientContact[]) => {
    setBusy(true);
    setError('');
    const err = await onSave({ ...client, contacts: next });
    setBusy(false);
    if (err) setError(err);
    return !err;
  };

  const add = async () => {
    if (!typed || draftError) return;
    const entry: ClientContact = {
      number: typed,
      name: String(draft.name || '').trim() || undefined,
      label: String(draft.label || '').trim() || undefined,
      primary: !contacts.length,
    };
    if (await write([...contacts, entry])) { setAdding(false); setDraft({ number: '' }); }
  };

  const remove = async (number: string) => {
    const next = contacts.filter((c) => c.number !== number);
    if (!next.some((c) => c.primary) && next[0]) next[0] = { ...next[0], primary: true };
    if (await write(next)) { setRemoving(null); if (via === normalizeContactNumber(number)) onVia(null); }
  };

  return (
    <SectionCard
      title="Contact numbers"
      subtitle={`${contacts.length} on file`}
      right={!adding && (
        <button onClick={() => setAdding(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">+ Add number</button>
      )}
    >
      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
        {contacts.map((c) => {
          const n = normalizeContactNumber(c.number);
          const h = historyFor(n);
          const active = via === n;
          return (
            <li key={n} className={`px-3 py-2 ${active ? 'bg-teal-50/60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] font-semibold text-gray-800 tracking-tight">{fmtPhone(n)}</span>
                    {c.primary && <span className="px-1.5 py-px rounded text-[9px] font-bold bg-[#0F766E] text-white">PRIMARY</span>}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{contactLabel(c) || <span className="text-gray-300">No name on file</span>}</div>
                </div>
                <button
                  onClick={() => onVia(active ? null : n)}
                  disabled={!h}
                  className={`text-right shrink-0 rounded-md px-2 py-1 border cursor-pointer disabled:cursor-default ${active ? 'border-[#0F766E] bg-white' : 'border-transparent hover:border-gray-200'}`}
                  title={h ? (active ? 'Show orders on every number' : 'Show only the orders placed on this number') : 'Order figures for this number have not been read'}
                >
                  <div className="text-[12px] font-semibold text-gray-800 font-mono">
                    {h ? `${h.orders} order${h.orders === 1 ? '' : 's'}` : <span className="text-gray-300">—</span>}
                  </div>
                  <div className="text-[10px] text-gray-400">{h ? fmtShortINR(h.lifetimeValue) : 'not read'}</div>
                </button>
              </div>
              {removing === c.number ? (
                <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                  <span className="text-red-700">Orders on this number will stop counting towards this firm.</span>
                  <button onClick={() => remove(c.number)} disabled={busy} className="font-semibold text-red-600 hover:underline cursor-pointer">Remove</button>
                  <button onClick={() => setRemoving(null)} className="text-gray-400 cursor-pointer">Keep</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  {!c.primary && (
                    <button onClick={() => write(contacts.map((x) => ({ ...x, primary: x.number === c.number })))} disabled={busy}
                      className="font-semibold text-gray-500 hover:text-[#0F766E] cursor-pointer">Make primary</button>
                  )}
                  {contacts.length > 1 && (
                    <button onClick={() => setRemoving(c.number)} className="font-semibold text-gray-400 hover:text-red-600 cursor-pointer">Remove</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!contacts.length && <li className="px-3 py-3 text-[11px] text-amber-700">No valid number on file, so no order can be linked to this firm.</li>}
      </ul>

      {adding && (
        <div className="mt-3 border border-gray-200 rounded-md p-3 bg-gray-50/60 flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={draft.number}
              onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              placeholder="10-digit mobile"
              className={`${inputCls} font-mono ${draftError ? 'border-red-300' : ''}`}
            />
            <input value={draft.name || ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" className={inputCls} />
            <input value={draft.label || ''} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Role" list="firm-contact-labels" className={inputCls} />
            <datalist id="firm-contact-labels">{CONTACT_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          {draftError && <p className="text-[11px] text-red-600">{draftError}</p>}
          <p className="text-[10px] text-gray-400">Every order placed on this number from now on, and every past one, counts towards this firm.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setDraft({ number: '' }); }} className={btnGhost}>Cancel</button>
            <button onClick={add} disabled={busy || !typed || !!draftError} className={btnPrimary}>{busy ? 'Saving…' : 'Add number'}</button>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-red-600 mt-2">Could not save: {error}</p>}
    </SectionCard>
  );
}
