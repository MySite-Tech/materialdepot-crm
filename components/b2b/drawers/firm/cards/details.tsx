'use client';

import { CLIENT_ENTITY_TYPES, CLIENT_SOURCES, ClientEntity, ClientEntityType, ClientSource, SEGMENTS, Segment, clientGateErrors, firmDetailGaps, normalizeGst, primaryContact, validateGst } from '../../../models/client';
import { RoleOptions } from '../../../ui/outreach-chips';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { firmHolding } from '../utils';
import { useState } from 'react';

const label = 'block text-[11.5px] font-medium text-gray-500 mb-1';

function Row({ title, missing, children }: { title: string; missing?: boolean; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={label}>{title}{missing && <span className="ml-1 text-red-600 font-semibold">missing</span>}</span>
      {children}
    </label>
  );
}

export function FirmDetailsModal({ client, clients, onClose, onSave }: {
  client: ClientEntity;
  clients: ClientEntity[];
  onClose: () => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const primary = primaryContact(client.contacts);
  const [draft, setDraft] = useState<ClientEntity>(client);
  const [person, setPerson] = useState({ name: primary?.name || '', role: primary?.role || '' });
  const [gst, setGst] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ClientEntity>(k: K, v: ClientEntity[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const gstCheck = gst.trim() ? validateGst(gst) : null;
  const gstHolder = gstCheck && gstCheck.normalized.length === 15 ? firmHolding(clients, client.id, { gst: gstCheck.normalized }) : undefined;
  const gstError = !gstCheck ? '' : gstHolder ? `Already on ${gstHolder.company}. Merge the two firms instead.` : !gstCheck.storable ? gstCheck.message || 'Not a valid GSTIN' : '';

  const next: ClientEntity = {
    ...draft,
    company: draft.company.trim(),
    city: String(draft.city || '').trim() || undefined,
    officeAddress: String(draft.officeAddress || '').trim() || undefined,
    contacts: draft.contacts.map((c) => (c.number === primary?.number ? { ...c, name: person.name.trim() || undefined, role: person.role.trim() || undefined } : c)),
    gsts: gstCheck && !gstError ? [...draft.gsts, { number: normalizeGst(gst) }] : draft.gsts,
  };
  const errors = clientGateErrors(next);
  const gaps = firmDetailGaps(next);
  const was = firmDetailGaps(client).map((g) => g.key);
  const missing = (key: string) => was.includes(key);

  const save = async () => {
    if (errors.length || gstError) return;
    setSaving(true);
    setError('');
    const err = await onSave(next);
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[620px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit details</h2>
            <p className={`text-[12px] mt-0.5 ${gaps.length ? 'text-red-600 font-medium' : 'text-teal-700'}`}>
              {gaps.length ? `${gaps.length} detail${gaps.length === 1 ? '' : 's'} still missing: ${gaps.map((g) => g.label).join(', ')}` : 'Every detail is filled.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <RoleOptions id="firm-contact-roles" />
          <Row title="Firm name">
            <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
          </Row>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Row title={`Contact person${primary ? ` on ${primary.number}` : ''}`} missing={missing('contact')}>
              <input value={person.name} disabled={!primary} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder={primary ? 'Name' : 'Add a number on People first'} className={inputCls} />
            </Row>
            <Row title="Their designation" missing={missing('role')}>
              <input value={person.role} disabled={!primary} onChange={(e) => setPerson({ ...person, role: e.target.value })} list="firm-contact-roles" placeholder="e.g. Owner" className={inputCls} />
            </Row>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Row title="Client type" missing={missing('clientType')}>
              <select value={draft.clientType || ''} onChange={(e) => set('clientType', (e.target.value || undefined) as ClientEntityType | undefined)} className={inputCls}>
                <option value="">Select…</option>
                {CLIENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Row>
            <Row title="Segment" missing={missing('segment')}>
              <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as Segment | undefined)} className={inputCls}>
                <option value="">Select…</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
              </select>
            </Row>
            <Row title="Source">
              <select value={draft.source} onChange={(e) => set('source', e.target.value as ClientSource)} className={inputCls}>
                {CLIENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Row>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
            <Row title="City" missing={missing('city')}>
              <input value={draft.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Bengaluru" className={inputCls} />
            </Row>
            <Row title="Office address" missing={missing('officeAddress')}>
              <input value={draft.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value)} placeholder="Street, area, pincode" className={inputCls} />
            </Row>
          </div>

          {draft.gsts.length ? (
            <p className="text-[12px] text-gray-500">GST: <span className="font-mono text-gray-800">{draft.gsts.map((g) => g.number).join(', ')}</span>. Add or remove GSTINs on the People tab.</p>
          ) : (
            <Row title="GST" missing={missing('gst')}>
              <input value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} placeholder="15-character GSTIN" className={inputCls + ' font-mono'} />
              {gstError && <span className="block text-[11px] text-red-600 mt-1">{gstError}</span>}
            </Row>
          )}

          <Row title="Remarks">
            <textarea value={draft.remarks || ''} onChange={(e) => set('remarks', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Row>

          {!!errors.length && (
            <div className="text-[11.5px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length || !!gstError} className={btnPrimary}>{saving ? 'Saving…' : 'Save details'}</button>
        </div>
      </div>
    </div>
  );
}
