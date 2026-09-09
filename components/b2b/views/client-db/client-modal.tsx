'use client';

import { KAMS } from '../../models/mockData';

import { CLIENT_ENTITY_TYPES, CLIENT_SOURCES, ClientEntity, ClientEntityType, ClientSource, SEGMENTS, Segment, clientEnrichmentGaps, clientGateErrors, normalizeContactNumber, normalizeGst } from '../../models/clientModel';
import { useState } from 'react';

import { ContactRows, GstRows } from './rows';
import { Field } from './ui';
import { btnGhost, btnPrimary, inputCls } from '../../utils/client-db';

export function ClientModal({ client, isNew, onClose, onSave }: {
  client: ClientEntity;
  isNew?: boolean;
  onClose: () => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<ClientEntity>(client);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ClientEntity>(k: K, v: ClientEntity[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = clientGateErrors(draft);
  const gaps = clientEnrichmentGaps(draft);

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setError('');
    const kamChanged = draft.kam !== client.kam;
    const next: ClientEntity = {
      ...draft,
      contacts: draft.contacts.map((c) => ({ ...c, number: normalizeContactNumber(c.number) })).filter((c) => c.number),
      gsts: draft.gsts.map((g) => ({ ...g, number: normalizeGst(g.number) })).filter((g) => g.number),
      assignments: kamChanged && draft.kam
        ? [...(draft.assignments || []), { kam: draft.kam, at: new Date().toISOString(), reason: isNew ? 'Set on creation' : 'Reassigned in the Client Database' }]
        : draft.assignments,
    };
    const err = await onSave(next);
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[620px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">{isNew ? 'Add Client' : draft.company || 'Client'}</h2>
            <p className="text-[11px] text-gray-400">Client Database PRD §3.1 / §6.1</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Company / business entity name">
            <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
          </Field>

          <Field label="Contact numbers" hint="Orders link to this client by these numbers, and by nothing else.">
            <ContactRows contacts={draft.contacts} onChange={(c) => set('contacts', c)} />
          </Field>

          <Field label="GST numbers" hint="Optional. Structure and check digit are validated here.">
            <GstRows gsts={draft.gsts} onChange={(g) => set('gsts', g)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Segment">
              <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as Segment | undefined)} className={inputCls}>
                <option value="">Select…</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Client type">
              <select value={draft.clientType || ''} onChange={(e) => set('clientType', (e.target.value || undefined) as ClientEntityType | undefined)} className={inputCls}>
                <option value="">Select…</option>
                {CLIENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select value={draft.source} onChange={(e) => set('source', e.target.value as ClientSource)} className={inputCls}>
                {CLIENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {draft.clientTypeRaw && !draft.clientType && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              The source module recorded this client as “{draft.clientTypeRaw}”, which is not one of the six types
              this module uses. Pick the right one rather than letting a guess stand.
            </p>
          )}

          <Field label="KAM" hint="Reassignable — every change is recorded on the account.">
            <select value={draft.kam || ''} onChange={(e) => set('kam', e.target.value || undefined)} className={inputCls}>
              <option value="">Unassigned</option>
              {[...new Set([...KAMS, ...(draft.kam ? [draft.kam] : [])])].sort().map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>

          <Field label="Remarks">
            <textarea value={draft.remarks || ''} onChange={(e) => set('remarks', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>

          {!!(draft.assignments || []).length && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Assignment history</div>
              <div className="flex flex-col gap-0.5">
                {[...(draft.assignments || [])].reverse().map((a, i) => (
                  <div key={i} className="text-[11px] text-gray-500">
                    <span className="font-medium text-gray-700">{a.kam}</span> · {String(a.at).slice(0, 10)}
                    {a.reason && <span className="text-gray-400"> · {a.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!(draft.mergedFrom || []).length && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Merged from</div>
              {(draft.mergedFrom || []).map((m) => (
                <div key={m.id} className="text-[11px] text-gray-500">
                  {m.company} <span className="text-gray-400 font-mono">({m.id})</span> · {m.mergedAt.slice(0, 10)}{m.mergedBy ? ` · ${m.mergedBy}` : ''}
                </div>
              ))}
            </div>
          )}

          {!!errors.length && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {!errors.length && !!gaps.length && (
            <p className="text-[11px] text-gray-400">Worth filling, but nothing is blocked: {gaps.join(' · ')}.</p>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length} className={btnPrimary}>
            {saving ? 'Saving…' : isNew ? 'Add client' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
