'use client';

import { firmHolding, fmtPhone } from '../utils';
import { CONTACT_CLASSES, ClientContact, ClientEntity, STUDIO_ACCESS, isValidContactNumber, normalizeContactNumber, StudioFirm, StudioLogin, studioFirmOf, studioLoginOf } from '../../../models/client';
import { useStudioLogins } from '../../../hooks/use-studio-logins';
import { addStudioNumber } from '@/lib/b2b/studio-logins';
import { fmtShortINR } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { ClientOrderHistory } from '@/lib/b2b';
import { useState } from 'react';

const selectCls = 'w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] cursor-pointer disabled:opacity-60';

function StudioBadge({ login, firm, loading, failed }: { login?: StudioLogin; firm: StudioFirm | null; loading: boolean; failed: boolean }) {
  const base = 'w-full rounded-md border px-1.5 py-1 text-[11px] truncate';
  if (loading) return <div className={`${base} border-gray-100 text-gray-300`}>Studio Space: reading…</div>;
  if (failed) return <div className={`${base} border-amber-200 text-amber-700`} title="Studio Space could not be reached, so access is unknown">Studio Space: unknown</div>;
  if (!login && firm) return <div className={`${base} border-gray-200 text-gray-600`} title={`${firm.firmName} is on Studio Space with ${firm.logins} login${firm.logins === 1 ? '' : 's'}. This number is not one of its numbers there.`}>Studio Space: firm on, number not</div>;
  if (!login) return <div className={`${base} border-gray-100 text-gray-400`} title="No Studio Space login uses this number">Studio Space: not onboarded</div>;
  const access = STUDIO_ACCESS[login.power ? 'power' : 'non-power'];
  const tabs = login.visibleTabs?.length ? `Tabs on: ${login.visibleTabs.join(', ')}` : login.visibleTabs ? 'No optional tabs on' : '';
  return (
    <div className={`${base} ${login.power ? 'border-teal-300 text-[#0F766E] font-semibold' : 'border-gray-200 text-gray-700'}`} title={[access.hint, tabs].filter(Boolean).join('. ')}>
      Studio Space · {access.label}
    </div>
  );
}

function AddToStudio({ firm, contact, onDone }: { firm: StudioFirm; contact: ClientContact; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async () => {
    setBusy(true);
    const err = await addStudioNumber(firm.partnerId, normalizeContactNumber(contact.number), contact.name || firm.firmName);
    setBusy(false);
    if (err) setError(err); else onDone();
  };
  return (
    <>
      <button onClick={add} disabled={busy} title={`Adds this number to ${firm.firmName}, approved, so its orders count there`} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer disabled:opacity-50 text-left">
        {busy ? 'Adding…' : 'Add to Studio Space'}
      </button>
      {error && <div className="text-[10px] text-red-600">{error}</div>}
    </>
  );
}

export function ContactsCard({ client, clients, canAddStudioNumber, historyFor, via, onVia, onSave }: {
  client: ClientEntity;
  clients: ClientEntity[];
  canAddStudioNumber?: boolean;
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
  const studio = useStudioLogins();

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

  const patch = (number: string, change: Partial<ClientContact>) =>
    write(contacts.map((x) => (x.number === number ? { ...x, ...change } : x)));

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
                  <div className="text-[11px] text-gray-500 truncate">{String(c.name || '').trim() || <span className="text-gray-300">No name on file</span>}</div>
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
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <select
                  value={c.label || ''}
                  onChange={(e) => patch(c.number, { label: e.target.value || undefined })}
                  disabled={busy}
                  title="What this person is at the firm"
                  className={`${selectCls} ${c.label ? 'text-gray-700' : 'text-amber-700 border-amber-300'}`}
                >
                  <option value="">Not classified</option>
                  {c.label && !(CONTACT_CLASSES as readonly string[]).includes(c.label) && <option value={c.label}>{c.label}</option>}
                  {CONTACT_CLASSES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <StudioBadge login={studio.logins ? studioLoginOf(c, studio.logins) : undefined} firm={studioFirmOf(client, studio.firms)} loading={studio.loading} failed={!!studio.error} />
                {canAddStudioNumber && studio.logins && !studioLoginOf(c, studio.logins) && studioFirmOf(client, studio.firms) && (
                  <AddToStudio firm={studioFirmOf(client, studio.firms)!} contact={c} onDone={studio.reload} />
                )}
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
            <select value={draft.label || ''} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} className={inputCls}>
              <option value="">Classification</option>
              {CONTACT_CLASSES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {draftError && <p className="text-[11px] text-red-600">{draftError}</p>}
          <p className="text-[10px] text-gray-400">Every order placed on this number from now on, and every past one, counts towards this firm.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setDraft({ number: '' }); }} className={btnGhost}>Cancel</button>
            <button onClick={add} disabled={busy || !typed || !!draftError} className={btnPrimary}>{busy ? 'Saving…' : 'Add number'}</button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-400 mt-2">
        Studio Space access is read from Studio Space itself, by this number. Power user: the whole dashboard. Normal user: a login restricted to some tabs, such as order tracking.
      </p>
      {error && <p className="text-[11px] text-red-600 mt-2">Could not save: {error}</p>}
    </SectionCard>
  );
}
