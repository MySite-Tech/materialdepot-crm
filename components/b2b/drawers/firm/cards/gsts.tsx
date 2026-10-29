'use client';

import { firmHolding, fmtGst } from '../utils';
import { ClientEntity, gstNumbers, normalizeGst, validateGst } from '../../../models/client';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { useState } from 'react';

export function GstsCard({ client, clients, onSave }: {
  client: ClientEntity;
  clients: ClientEntity[];
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const gsts = (client.gsts || []).filter((g) => normalizeGst(g.number));
  const v = validateGst(draft);
  const holder = v.normalized.length === 15 ? firmHolding(clients, client.id, { gst: v.normalized }) : undefined;
  const draftError = v.check === 'empty' ? ''
    : !v.storable ? v.message || 'Not a valid GSTIN.'
    : gstNumbers(gsts).includes(v.normalized) ? 'This GSTIN is already on this firm.'
    : holder ? `Already on ${holder.company || 'another firm'}. If they are one business, merge the two firms instead.`
    : '';

  const write = async (next: ClientEntity['gsts']) => {
    setBusy(true);
    setError('');
    const err = await onSave({ ...client, gsts: next });
    setBusy(false);
    if (err) setError(err);
    return !err;
  };

  const add = async () => {
    if (v.check === 'empty' || draftError) return;
    if (await write([...gsts, { number: v.normalized }])) { setAdding(false); setDraft(''); }
  };

  return (
    <SectionCard
      title="GST numbers"
      subtitle={`${gsts.length} on file`}
      right={!adding && (
        <button onClick={() => setAdding(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">+ Add GST</button>
      )}
    >
      {!gsts.length && !adding ? (
        <div className="border border-dashed border-gray-200 rounded-md px-3 py-4 text-center">
          <p className="text-[11px] text-gray-400">No GSTIN on file.</p>
          <button onClick={() => setAdding(true)} className="mt-1 text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Add the firm&apos;s GST number</button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
          {gsts.map((g) => {
            const r = validateGst(g.number);
            return (
              <li key={r.normalized} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-semibold text-gray-800 tracking-tight">{fmtGst(r.normalized)}</span>
                  {r.check === 'valid'
                    ? <span className="px-1.5 py-px rounded text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">VALID</span>
                    : <span className="px-1.5 py-px rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title={r.message}>CHECK DIGIT</span>}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {[r.stateName, r.pan && `PAN ${r.pan}`].filter(Boolean).join(' · ')}
                </div>
                <div className="text-[10px] mt-0.5">
                  {g.registeredName
                    ? <span className="text-gray-600">Registered as {g.registeredName}</span>
                    : <span className="text-gray-300" title="There is no GST Validator in this stack">Registered name not available</span>}
                </div>
                {removing === g.number ? (
                  <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                    <span className="text-red-700">Remove this GSTIN from the firm?</span>
                    <button onClick={async () => { if (await write(gsts.filter((x) => x.number !== g.number))) setRemoving(null); }} disabled={busy}
                      className="font-semibold text-red-600 hover:underline cursor-pointer">Remove</button>
                    <button onClick={() => setRemoving(null)} className="text-gray-400 cursor-pointer">Keep</button>
                  </div>
                ) : (
                  <button onClick={() => setRemoving(g.number)} className="mt-1 text-[10px] font-semibold text-gray-400 hover:text-red-600 cursor-pointer">Remove</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-3 border border-gray-200 rounded-md p-3 bg-gray-50/60 flex flex-col gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="15-character GSTIN, e.g. 29ABCDE1234F1Z5"
            maxLength={20}
            className={`${inputCls} font-mono ${draftError ? 'border-red-300' : v.check === 'bad-checksum' ? 'border-amber-300' : ''}`}
          />
          {draftError && <p className="text-[11px] text-red-600">{draftError}</p>}
          {!draftError && v.check === 'valid' && <p className="text-[11px] text-[#0F766E]">Valid · {v.stateName} · PAN {v.pan}</p>}
          {!draftError && v.check === 'bad-checksum' && <p className="text-[11px] text-amber-700">{v.message} It will be saved with a warning.</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setDraft(''); }} className={btnGhost}>Cancel</button>
            <button onClick={add} disabled={busy || v.check === 'empty' || !!draftError} className={btnPrimary}>{busy ? 'Saving…' : 'Add GST'}</button>
          </div>
        </div>
      )}
      {!!gsts.length && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
          Enquiries are matched to this firm by its numbers only. Django&apos;s tickets carry no GSTIN and{' '}
          <span className="font-mono">/crm/leads/</span> has no GST filter, so an enquiry billed to one of these GSTINs but raised on a
          number not listed here cannot be found yet. Needs a <span className="font-mono">gst=</span> filter on that endpoint (Django team).
        </p>
      )}
      {error && <p className="text-[11px] text-red-600 mt-2">Could not save: {error}</p>}
    </SectionCard>
  );
}
