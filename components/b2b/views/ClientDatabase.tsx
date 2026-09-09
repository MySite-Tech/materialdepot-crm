'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClients, upsertClient, deleteB2BRow, fetchClientOrderHistories,
  fetchClientOrderRows, orderDatesFromRows, clientMetricsFrom, invalidateClientTickets,
  planClientSeed, clientFromSeed, ORDER_DETAIL_PHONE_CAP,
  type ClientOrderDetails, type ClientOrderRow, type ClientOrderHistory, type ClientSeedPlan,
} from '@/lib/b2bLeads';
import { KAMS, fmtL, fmtINR } from '../models/mockData';
import {
  CLIENT_ENTITY_TYPES, CLIENT_SOURCES, SEGMENTS, ACTIVE_WINDOW_MONTHS,
  CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT,
  clientStatus, daysToInactive, clientGateErrors, clientEnrichmentGaps,
  contactNumbers, gstNumbers, primaryContact, contactLabel, validateGst,
  normalizeContactNumber, normalizeGst, isValidContactNumber,
  findDuplicates, mergeConflicts, mergeClients, EVIDENCE_LABEL, EVIDENCE_IS_EXACT,
  MERGE_FIELD_LABEL, currentTemperature, temperatureColor, istToday,
  type ClientEntity, type ClientContact, type ClientGst, type ClientEntityType,
  type ClientOrderMetrics, type ClientSource, type ClientStatus, type Segment,
  type DuplicateSuggestion, type MergeChoices,
} from '../models/clientModel';
import {
  CLIENT_UPLOAD_COLUMNS, CLIENT_UPLOAD_MANDATORY, CLIENT_UPLOAD_FORMAT,
  parseDelimited, validateClientRows, summarizeClientImport,
  CLIENT_IMPORT_LOG_HEADERS, clientImportLogRows, templateSheets,
  type ClientImportResult,
} from '../io/clientImport';
import { exportRowsCsv, exportRowsExcel, todayStr, ExportButton, type ExportFormat } from '../ui/exportUtils';

const inputCls = 'w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]';
const btnPrimary = 'px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50 cursor-pointer';
const btnGhost = 'px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50';

function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

function StatusPill({ status, days }: { status: ClientStatus; days?: number }) {
  const c = CLIENT_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: c + '18', color: c }}
      title={CLIENT_STATUS_HINT[status] + (days !== undefined ? ` · ${days} days left in the window` : '')}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
      {status === 'Active' && days !== undefined && days <= 30 && <span className="font-mono">{days}d</span>}
    </span>
  );
}

function Metric({ value, state, format }: {
  value: number | string | undefined;
  state: ClientOrderMetrics['dateState'];
  format?: (n: number) => string;
}) {
  if (value === undefined || value === null || value === '') {
    if (state === 'pending') return <span className="text-gray-300">…</span>;
    if (state === 'no-phone') return <span className="text-gray-300" title="No valid contact number, so orders cannot be linked">no phone</span>;
    if (state === 'unavailable') return <span className="text-blue-400" title="Could not be read from the deal tickets">unread</span>;
    return <span className="text-gray-300">—</span>;
  }
  return <span>{typeof value === 'number' && format ? format(value) : String(value)}</span>;
}

function ContactRows({ contacts, onChange }: { contacts: ClientContact[]; onChange: (c: ClientContact[]) => void }) {
  const set = (i: number, patch: Partial<ClientContact>) =>
    onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const makePrimary = (i: number) =>
    onChange(contacts.map((c, j) => ({ ...c, primary: j === i })));

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c, i) => {
        const bad = String(c.number || '').trim() && !isValidContactNumber(c.number);
        return (
          <div key={i} className="grid grid-cols-12 gap-1.5 items-start">
            <input
              value={c.number}
              onChange={(e) => set(i, { number: e.target.value })}
              placeholder="10-digit number"
              className={`col-span-4 ${inputCls} ${bad ? 'border-red-300' : ''}`}
            />
            <input value={c.name || ''} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" className={`col-span-3 ${inputCls}`} />
            <input value={c.label || ''} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label (Owner…)" className={`col-span-3 ${inputCls}`} />
            <button
              onClick={() => makePrimary(i)}
              title="Primary — the number orders are mainly placed on"
              className={`col-span-1 h-[30px] text-[10px] font-bold rounded-md border ${c.primary ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-gray-400 border-gray-200'} cursor-pointer`}
            >
              1°
            </button>
            <button
              onClick={() => onChange(contacts.filter((_, j) => j !== i))}
              disabled={contacts.length === 1}
              className="col-span-1 h-[30px] text-[13px] text-gray-300 hover:text-red-500 disabled:opacity-30 cursor-pointer"
            >
              ×
            </button>
            {bad && <p className="col-span-12 text-[10px] text-red-600 -mt-1">Not a valid 10-digit Indian mobile number.</p>}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...contacts, { number: '', primary: contacts.length === 0 }])}
        className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
      >
        + Add contact number
      </button>
    </div>
  );
}

function GstRows({ gsts, onChange }: { gsts: ClientGst[]; onChange: (g: ClientGst[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {gsts.map((g, i) => {
        const v = validateGst(g.number);
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex gap-1.5 items-start">
              <input
                value={g.number}
                onChange={(e) => onChange(gsts.map((x, j) => (j === i ? { ...x, number: e.target.value.toUpperCase() } : x)))}
                placeholder="15-character GSTIN"
                className={`${inputCls} font-mono ${!v.storable ? 'border-red-300' : v.check === 'bad-checksum' ? 'border-amber-300' : ''}`}
              />
              <button onClick={() => onChange(gsts.filter((_, j) => j !== i))} className="px-2 text-[13px] text-gray-300 hover:text-red-500 cursor-pointer">×</button>
            </div>
            {v.check === 'valid' && (
              <span className="text-[10px] text-[#0F766E]">
                Valid · {v.stateName} · PAN {v.pan}
                <span className="text-gray-400"> — registered company name needs a GST Validator, which this CRM does not have</span>
              </span>
            )}
            {v.check === 'bad-checksum' && <span className="text-[10px] text-amber-700">{v.message} Saved anyway.</span>}
            {!v.storable && v.check !== 'empty' && <span className="text-[10px] text-red-600">{v.message}</span>}
            {g.registeredName && <span className="text-[10px] text-gray-500">Registered as {g.registeredName}</span>}
          </div>
        );
      })}
      <button onClick={() => onChange([...gsts, { number: '' }])} className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
        + Add GST number
      </button>
    </div>
  );
}

function OrderDetailsTable({ rows, failedPhones, rejected, loading, onRecheck }: {
  rows: ClientOrderRow[];
  failedPhones: string[];
  rejected: number;
  loading: boolean;
  onRecheck: () => void;
}) {
  if (loading) return <p className="text-[11px] text-gray-400 py-3">Reading the deal tickets…</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Order details · {rows.length} enquir{rows.length === 1 ? 'y' : 'ies'}
        </span>
        <button onClick={onRecheck} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Re-check Procurement</button>
      </div>

      {!!failedPhones.length && (
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">
          {failedPhones.length} contact number{failedPhones.length === 1 ? '' : 's'}{' '}
          could not be read{' '}
          ({failedPhones.join(', ')}). This client&apos;s orders are <span className="font-semibold">incomplete</span>, not absent.
        </p>
      )}

      {!rows.length ? (
        <p className="text-[11px] text-gray-300 py-3 text-center">
          {failedPhones.length ? 'Nothing readable on the numbers that did load.' : 'No enquiry has ever been raised on this client’s numbers.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[860px]">
            <thead>
              <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                <th className="text-left font-semibold py-1.5 pr-2">Enquiry ID</th>
                <th className="text-left font-semibold py-1.5 pr-2">Contact</th>
                <th className="text-left font-semibold py-1.5 pr-2">Company on order</th>
                <th className="text-left font-semibold py-1.5 pr-2">GST on order</th>
                <th className="text-right font-semibold py-1.5 pr-2">Order value</th>
                <th className="text-left font-semibold py-1.5 pr-2">Status</th>
                <th className="text-left font-semibold py-1.5 pr-2">Order placed</th>
                <th className="text-left font-semibold py-1.5">SPOC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enqId + r.contactNumber} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-gray-700">{r.enqId}</td>
                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                    <span className="font-mono">{r.contactNumber}</span>
                    {r.contactName && <span className="text-gray-400"> · {r.contactName}</span>}
                  </td>

                  <td className="py-1.5 pr-2 text-gray-300 italic" title="Not in the deal-ticket response — see ClientOrderRow in b2bLeads.ts">not in Procurement</td>
                  <td className="py-1.5 pr-2 text-gray-300 italic" title="Not in the deal-ticket response">not in Procurement</td>
                  <td className="py-1.5 pr-2 text-right font-mono font-semibold text-gray-700 whitespace-nowrap">{fmtINR(r.orderValue)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background: (r.ordered ? '#22C55E' : r.lost ? '#EF4444' : '#F59E0B') + '18',
                        color: r.ordered ? '#15803D' : r.lost ? '#B91C1C' : '#B45309',
                      }}
                    >
                      {r.status || '—'}
                    </span>
                    {r.lostReason && <span className="text-gray-400"> · {r.lostReason}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                    {r.orderPlacedDate
                      ? r.orderPlacedDate
                      : r.ordered
                        ? <span className="text-gray-400" title="Ordered, but the ticket carries no closure date">no closure date</span>
                        : <span className="text-gray-400">cart {r.createdAt || '—'}</span>}
                  </td>
                  <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.spoc || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-1.5">
        Every row comes from a Django deal ticket matched to this client by an EXACT contact-number match.
        {!!rejected && ` ${rejected} ticket${rejected === 1 ? ' the search returned under a different number was' : 's the search returned under different numbers were'} discarded.`}
        {' '}“KAM” on an order is the account&apos;s KAM <span className="italic">today</span> — nothing records who held it at the time.
      </p>
    </>
  );
}

function ClientModal({ client, isNew, onClose, onSave }: {
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

function MergeModal({ clients, suggestions, onClose, onMerge }: {
  clients: ClientEntity[];
  suggestions: DuplicateSuggestion[];
  onClose: () => void;
  onMerge: (sources: ClientEntity[], choices: MergeChoices) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<MergeChoices>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sources = useMemo(
    () => selected.map((id) => clients.find((c) => c.id === id)).filter((c): c is ClientEntity => !!c),
    [selected, clients],
  );
  const conflicts = useMemo(() => (sources.length >= 2 ? mergeConflicts(sources) : []), [sources]);
  const unresolved = conflicts.filter((c) => !(choices as Record<string, string | undefined>)[c.field]);

  const toggle = (id: string) => {
    setChoices({});
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    return clients.filter((c) =>
      c.company.toLowerCase().includes(q)
      || (digits.length >= 4 && contactNumbers(c.contacts).some((p) => p.includes(digits)))
      || gstNumbers(c.gsts).some((g) => g.toLowerCase().includes(q)));
  }, [clients, q]);

  const run = async () => {
    setBusy(true);
    setError('');
    const err = await onMerge(sources, choices);
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[760px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Merge Clients</h2>
            <p className="text-[11px] text-gray-400">
              One real client that has ordered under more than one number or GST · §4
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Search by company name, GST or contact number">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Metro / 27AAPFU… / 9900099013" className={inputCls} />
          </Field>

          {!!matches.length && (
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[180px] overflow-y-auto">
              {matches.map((c) => (
                <label key={c.id} className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="mt-0.5" />
                  <span className="text-[12px]">
                    <span className="font-medium text-gray-700">{c.company}</span>
                    <span className="text-gray-400"> · {contactNumbers(c.contacts).join(', ') || 'no number'}</span>
                    {!!gstNumbers(c.gsts).length && <span className="text-gray-400 font-mono"> · {gstNumbers(c.gsts).join(', ')}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Likely duplicates · {suggestions.length}
            </div>
            {!suggestions.length ? (
              <p className="text-[11px] text-gray-300 py-2">Nothing looks duplicated.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                {suggestions.map((s, i) => {
                  const exact = s.evidence.some((e) => EVIDENCE_IS_EXACT[e]);
                  return (
                    <div key={i} className={`border rounded-md px-2 py-1.5 ${exact ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[12px] min-w-0">
                          <span className="font-medium text-gray-700">{s.a.company}</span>
                          <span className="text-gray-400"> ↔ </span>
                          <span className="font-medium text-gray-700">{s.b.company}</span>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {s.evidence.map((e) => EVIDENCE_LABEL[e]).join(' · ')}
                            {!!s.shared.length && <span className="font-mono text-gray-400"> — {s.shared.join(', ')}</span>}
                          </div>
                          {!exact && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              Name only. Two firms can have similar names — check before merging.
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setChoices({}); setSelected([s.a.id, s.b.id]); }}
                          className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Select both
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sources.length >= 2 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Merging {sources.length}{' '}records
              </div>
              <div className="text-[11px] text-gray-600 mb-3">
                {sources.map((c) => c.company).join(' + ')} → one entity keeping{' '}
                <span className="font-semibold">
                  {[...new Set(sources.flatMap((c) => contactNumbers(c.contacts)))].length}{' '}contact number(s)
                </span>{' '}and{' '}
                <span className="font-semibold">
                  {[...new Set(sources.flatMap((c) => gstNumbers(c.gsts)))].length}{' '}GST(s)
                </span>. Every historical Enquiry ID rolls up automatically, because order history is derived
                from those numbers and was never stored on the record.
              </div>

              {!conflicts.length ? (
                <p className="text-[11px] text-[#0F766E]">These records agree on everything — nothing to choose.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-amber-700">
                    These records disagree. PRD open question #1 asks which value should win; nothing is picked for
                    you, because a segment chosen by a machine changes how the account is targeted and nobody would
                    know it was guessed.
                  </p>
                  {conflicts.map((c) => (
                    <div key={c.field} className="flex items-start gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-gray-500 w-24 shrink-0 pt-1">{MERGE_FIELD_LABEL[c.field]}</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {c.options.map((o) => {
                          const active = (choices as Record<string, string | undefined>)[c.field] === o.value;
                          return (
                            <button
                              key={o.value}
                              onClick={() => setChoices((ch) => ({ ...ch, [c.field]: o.value } as MergeChoices))}
                              title={`From ${o.from.join(', ')}`}
                              className={`px-2 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${active ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-gray-600 border-gray-200'}`}
                            >
                              {o.value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            {unresolved.length ? `Pick a value for ${unresolved.map((c) => MERGE_FIELD_LABEL[c.field]).join(', ')}.` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button onClick={run} disabled={busy || sources.length < 2 || !!unresolved.length} className={btnPrimary}>
              {busy ? 'Merging…' : `Merge ${sources.length || ''} records`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadModal({ existing, onClose, onImport }: {
  existing: ClientEntity[];
  onClose: () => void;
  onImport: (result: ClientImportResult) => Promise<Record<string, string>>;
}) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string> | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    setSaveErrors(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        setFileRows(parseDelimited(await file.text()));
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

        const ws = wb.Sheets['Template'] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('the workbook has no readable sheet');
        setFileRows(XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: true, raw: false, defval: '' }));
      }
      setFileName(file.name);
      setText('');
    } catch (e) {
      setFileRows(null);
      setFileName('');
      setFileError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}. Use .xlsx, .xls or .csv.`);
    }
  };

  const parsed = useMemo(() => {
    const rows = fileRows ?? (text.trim() ? parseDelimited(text) : []);
    if (!rows.length) return null;
    return validateClientRows(rows, existing);
  }, [fileRows, text, existing]);

  const withSave = useMemo(() => {
    if (!parsed || !saveErrors) return parsed;
    return {
      ...parsed,
      entities: parsed.entities.map((e) => (e.client && saveErrors[e.client.id] ? { ...e, saveError: saveErrors[e.client.id] } : e)),
    };
  }, [parsed, saveErrors]);

  const summary = withSave ? summarizeClientImport(withSave) : null;
  const writable = (withSave?.entities || []).filter((e) => e.client && !e.saveError);

  const doImport = async () => {
    if (!withSave || !writable.length) return;
    setSaving(true);
    try {
      const errors = await onImport(withSave);
      if (Object.keys(errors).length) setSaveErrors(errors); else onClose();
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const sheet of templateSheets()) {
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
      if (sheet.colWidths) ws['!cols'] = sheet.colWidths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    XLSX.writeFile(wb, 'Client_Database_Upload_Template.xlsx');
  };

  const downloadLog = () => {
    if (!withSave) return;
    exportRowsCsv(CLIENT_IMPORT_LOG_HEADERS, clientImportLogRows(withSave), `client-import-log-${todayStr()}`);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[820px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Bulk Upload Clients</h2>
            <p className="text-[11px] text-gray-400">Client Database PRD §6.2 / §7</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-gray-500 min-w-0 flex-1">
              <p className="mb-1">Columns, in this order — <span className="font-semibold">one row = one contact number / GST pairing</span>, so a client with two numbers is two rows sharing a Company Name:</p>
              <div className="text-[11px] bg-gray-50 rounded-md p-2 overflow-x-auto">
                {CLIENT_UPLOAD_COLUMNS.map((c, i) => (
                  <span key={c} className="whitespace-nowrap">
                    <span className="text-gray-400">{i + 1}.</span>{' '}
                    <span className={CLIENT_UPLOAD_MANDATORY[c] ? 'font-semibold text-gray-700' : 'text-gray-500'} title={CLIENT_UPLOAD_FORMAT[c]}>{c}</span>
                    {CLIENT_UPLOAD_MANDATORY[c] && <span className="text-red-400">*</span>}
                    {i < CLIENT_UPLOAD_COLUMNS.length - 1 && <span className="text-gray-300">{'  ·  '}</span>}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={downloadTemplate} className={btnGhost + ' whitespace-nowrap'}>⇩ Download template</button>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold"
            />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {parsed?.rows.length || 0} data rows{parsed?.skipped ? ` · ${parsed.skipped} header/blank skipped` : ''}</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); setFileError(''); setSaveErrors(null); }}
              rows={3}
              placeholder={'Metro Constructions, 9900099013, Rahul Nair, Owner, 27AAPFU0939F1ZV, 1, Contractor, , Monthly orders'}
              className={inputCls + ' resize-none font-mono text-[11px]'}
            />
          </label>

          {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}

          {withSave && summary && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {!!summary.entitiesCreate && <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{summary.entitiesCreate} new client{summary.entitiesCreate === 1 ? '' : 's'}</span>}
                  {!!summary.entitiesUpdate && <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold">{summary.entitiesUpdate} updated</span>}
                  {!!summary.entitiesMerge && <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">{summary.entitiesMerge} merged in</span>}
                  {!!summary.rowsWarned && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{summary.rowsWarned} warning{summary.rowsWarned === 1 ? '' : 's'}</span>}
                  {!!summary.rowsRejected && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.rowsRejected} rejected</span>}
                  {!!summary.entitiesFailed && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.entitiesFailed} not saved</span>}
                </div>
                <button onClick={downloadLog} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">Download log (.csv)</button>
              </div>

              {!!withSave.possibleDuplicates.length && (
                <div className="border border-amber-200 bg-amber-50 rounded-md px-2 py-1.5 text-[11px] text-amber-900">
                  <div className="font-semibold mb-0.5">{withSave.possibleDuplicates.length} possible duplicate{withSave.possibleDuplicates.length === 1 ? '' : 's'} — uploaded as new clients, not merged</div>
                  {withSave.possibleDuplicates.slice(0, 5).map((d, i) => (
                    <div key={i}>“{d.company}” looks like existing “{d.existingCompany}” but shares no number or GST. Merge by hand if they are the same firm.</div>
                  ))}
                </div>
              )}

              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="max-h-[180px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                        <th className="text-left font-semibold px-2 py-1.5">Client</th>
                        <th className="text-left font-semibold px-2 py-1.5">Action</th>
                        <th className="text-left font-semibold px-2 py-1.5">Numbers / GSTs</th>
                        <th className="text-left font-semibold px-2 py-1.5">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withSave.entities.map((e) => (
                        <tr key={e.key} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 font-medium text-gray-700">{e.company}</td>
                          <td className="px-2 py-1.5">
                            {e.saveError
                              ? <span className="text-red-600">{e.saveError}</span>
                              : e.action === 'create'
                                ? <span className="text-green-700">new</span>
                                : <span className="text-teal-700">{e.action === 'merge-into' ? 'merge into' : 'update'} “{e.existingCompany}” <span className="text-gray-400">({e.matchedOn})</span></span>}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-500">
                            {e.contacts.map((c) => c.number).join(', ')}
                            {!!e.gsts.length && <span className="text-gray-400"> · {e.gsts.map((g) => g.number).join(', ')}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400 font-mono">{e.lines.join(' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {withSave.rows.some((r) => r.issues.length) && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="max-h-[180px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {withSave.rows.filter((r) => r.issues.length).map((r) => (
                          <tr key={r.line} className="border-t border-gray-100 align-top">
                            <td className="px-2 py-1.5 font-mono text-gray-400 w-10">{r.line}</td>
                            <td className="px-2 py-1.5 text-gray-700 font-medium">{r.company || <span className="text-gray-300">(blank)</span>}</td>
                            <td className="px-2 py-1.5">
                              {r.issues.map((issue, i) => (
                                <div key={i} className={issue.severity === 'error' ? 'text-red-600' : 'text-amber-700'}>
                                  <span className="text-gray-400">{issue.column}:</span> {issue.message}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            {saveErrors ? `${Object.keys(saveErrors).length} client(s) could not be saved.` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>{saveErrors ? 'Close' : 'Cancel'}</button>
            <button onClick={doImport} disabled={saving || !writable.length} className={btnPrimary}>
              {saving ? 'Importing…' : writable.length ? `Import ${writable.length} client${writable.length === 1 ? '' : 's'}` : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeedModal({ onClose, onSeed }: {
  onClose: () => void;
  onSeed: (plan: ClientSeedPlan) => Promise<{ saved: number; errors: string[] }>;
}) {
  const [plan, setPlan] = useState<ClientSeedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; errors: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    planClientSeed([])
      .then(setPlan)
      .catch((e) => { console.error('[b2b] seed plan failed', e); setFailed(true); })
      .finally(() => setLoading(false));
  }, []);

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setResult(await onSeed(plan));
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Seed the Client Database</h2>
            <p className="text-[11px] text-gray-400">From closed Inbound / Outreach leads and the KAM board</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-3">
          <p className="text-[12px] text-gray-500">
            PRD open question #4 asks whether a Procurement export is needed to seed order history.
            It is not — Order Details is derived from the deal tickets, which already hold every historical order.
            What needs seeding is the entity list, and the CRM already names every client it has closed.
            <span className="block mt-1">
              Matching is <span className="font-semibold">exact on the contact number</span>. A similar company name
              is never treated as the same client; those pairs show up on the Merge screen for a human to decide.
            </span>
          </p>

          {loading && <p className="text-[12px] text-gray-400">Reading the lead boards…</p>}
          {failed && <p className="text-[12px] text-red-600">Could not read the lead boards. Nothing was written — close and retry.</p>}

          {plan && (
            <>
              <div className="flex gap-2 flex-wrap text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{plan.create.length} to create</span>
                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-semibold">{plan.alreadyLinked.length} already in the master</span>
                {!!plan.unusable.length && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{plan.unusable.length} without a usable number</span>}
              </div>

              {!!plan.unusable.length && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  {plan.unusable.length} record{plan.unusable.length === 1 ? '' : 's'}{' '}
                  name a company but carry no valid{' '}
                  10-digit number, so no order could ever be linked to them. They are skipped, not guessed at —
                  add them by hand once you have a number.
                </p>
              )}

              {!plan.create.length ? (
                <p className="text-[12px] text-gray-400">Nothing new to seed.</p>
              ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                          <th className="text-left font-semibold px-2 py-1.5">Company</th>
                          <th className="text-left font-semibold px-2 py-1.5">Number</th>
                          <th className="text-left font-semibold px-2 py-1.5">Source</th>
                          <th className="text-left font-semibold px-2 py-1.5">KAM</th>
                          <th className="text-left font-semibold px-2 py-1.5">From</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.create.map((c) => (
                          <tr key={c.phone} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 font-medium text-gray-700">{c.company}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-500">{c.phone}</td>
                            <td className="px-2 py-1.5 text-gray-500">{c.source}</td>
                            <td className="px-2 py-1.5 text-gray-500">{c.kam || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-1.5 text-gray-400">{c.origin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result && (
                <div className={`text-[12px] rounded-md px-2 py-1.5 ${result.errors.length ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                  {result.saved} client{result.saved === 1 ? '' : 's'}{' '}written.
                  {!!result.errors.length && ` ${result.errors.length} failed: ${result.errors.slice(0, 3).join('; ')}`}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>{result ? 'Close' : 'Cancel'}</button>
          <button onClick={run} disabled={busy || !plan?.create.length || !!result} className={btnPrimary}>
            {busy ? 'Writing…' : `Create ${plan?.create.length || 0} clients`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientDatabase() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<{ byPhone: Record<string, { last?: string; loaded: boolean }> } | null>(null);
  const [detailsByClient, setDetailsByClient] = useState<Record<string, ClientOrderDetails>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientEntity | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [capped, setCapped] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kamFilter, setKamFilter] = useState('all');

  const today = istToday();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchClients();
      setClients(list);

      const phones = list.flatMap((c) => contactNumbers(c.contacts));
      const agg = await fetchClientOrderHistories(phones);
      setAggregates(agg);
      const head = phones.slice(0, ORDER_DETAIL_PHONE_CAP);
      setCapped(Math.max(0, phones.length - head.length));
      const details = await fetchClientOrderRows(head);
      setDates(orderDatesFromRows(details, head));
    } catch (e) {
      console.error('[b2b] client database load failed', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metricsFor = useCallback(
    (c: ClientEntity): ClientOrderMetrics => clientMetricsFrom(c.contacts, aggregates, dates || undefined),
    [aggregates, dates],
  );

  const loadDetails = useCallback(async (c: ClientEntity, force = false) => {
    const phones = contactNumbers(c.contacts);
    if (!phones.length) return;
    if (force) invalidateClientTickets(phones);
    setDetailLoading((s) => ({ ...s, [c.id]: true }));
    try {
      const details = await fetchClientOrderRows(phones);
      setDetailsByClient((s) => ({ ...s, [c.id]: details }));
    } finally {
      setDetailLoading((s) => ({ ...s, [c.id]: false }));
    }
  }, []);

  const toggleExpand = (c: ClientEntity) => {
    if (expanded === c.id) { setExpanded(null); return; }
    setExpanded(c.id);
    if (!detailsByClient[c.id]) loadDetails(c);
  };

  const suggestions = useMemo(() => findDuplicates(clients), [clients]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return clients
      .map((client) => {
        const metrics = metricsFor(client);
        return { client, metrics, status: clientStatus(metrics, today), days: daysToInactive(metrics, today) };
      })
      .filter(({ client, status }) => {
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (segmentFilter !== 'all' && client.segment !== segmentFilter) return false;
        if (typeFilter !== 'all' && client.clientType !== typeFilter) return false;
        if (kamFilter !== 'all' && (client.kam || '') !== (kamFilter === 'unassigned' ? '' : kamFilter)) return false;
        if (!q) return true;
        return client.company.toLowerCase().includes(q)
          || (client.contacts || []).some((c) => (c.name || '').toLowerCase().includes(q))
          || (digits.length >= 4 && contactNumbers(client.contacts).some((p) => p.includes(digits)))
          || gstNumbers(client.gsts).some((g) => g.toLowerCase().includes(q));
      })
      .sort((a, b) =>
        String(b.metrics.lastOrderPlaced || '').localeCompare(String(a.metrics.lastOrderPlaced || ''))
        || a.client.company.localeCompare(b.client.company));
  }, [clients, metricsFor, search, statusFilter, segmentFilter, typeFilter, kamFilter, today]);

  const kamOptions = useMemo(() => {
    const seen = new Set<string>(KAMS);
    clients.forEach((c) => c.kam && seen.add(c.kam));
    return [...seen].sort();
  }, [clients]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
    return null;
  };

  const runMerge = async (sources: ClientEntity[], choices: MergeChoices): Promise<string | null> => {
    const { merged, absorbed } = mergeClients(sources, choices, undefined);

    const writeError = await upsertClient(merged);
    if (writeError) return `The merged client could not be saved, so nothing was deleted: ${writeError}`;

    const deleteErrors: string[] = [];
    const deleted: string[] = [];
    for (const c of absorbed) {
      const err = await deleteB2BRow(c.id);
      if (err) deleteErrors.push(`${c.company}: ${err}`); else deleted.push(c.id);
    }

    setClients((prev) => {
      const gone = new Set(deleted);
      const next = prev.filter((c) => !gone.has(c.id));
      return next.some((c) => c.id === merged.id)
        ? next.map((c) => (c.id === merged.id ? merged : c))
        : [merged, ...next];
    });

    load();

    return deleteErrors.length
      ? `Merged, but ${deleteErrors.length} old record(s) could not be deleted and will still show as duplicates: ${deleteErrors.join('; ')}`
      : null;
  };

  const exportRows = (format: ExportFormat) => {
    const headers = [
      'Company Name', 'Contact Person', 'Primary Contact', 'All Contact Numbers', 'GST Numbers',
      'Segment', 'Client Type', 'Source', 'KAM', 'Client Status',
      'Last Order Placed', 'Number of Orders', 'Total Revenue', 'Average Order Value', 'Temperature', 'Remarks',
    ];
    const body = rows.map(({ client, metrics, status }) => {
      const primary = primaryContact(client.contacts);
      const temp = currentTemperature(client.interactions);
      return [
        client.company,
        contactLabel(primary),
        primary?.number || '',
        contactNumbers(client.contacts).join(' '),
        gstNumbers(client.gsts).join(' '),
        client.segment || '',
        client.clientType || '',
        client.source,
        client.kam || '',
        status,
        metrics.lastOrderPlaced || (metrics.dateState === 'unavailable' ? 'unread' : ''),
        metrics.orders ?? '',
        metrics.totalRevenue ?? '',
        metrics.averageOrderValue !== undefined ? Math.round(metrics.averageOrderValue) : '',
        temp ? temp.value : '',
        client.remarks || '',
      ];
    });
    setExporting(true);
    try {
      if (format === 'csv') exportRowsCsv(headers, body, `client-database-${todayStr()}`);
      else exportRowsExcel(headers, body, `client-database-${todayStr()}`, 'Clients');
    } finally {
      setExporting(false);
    }
  };

  const blank = (): ClientEntity => ({
    id: `CLI-${Date.now()}`,
    company: '',
    contacts: [{ number: '', primary: true }],
    gsts: [],
    source: 'Existing',
    interactions: [],
    escalations: [],
    createdAt: new Date().toISOString(),
  });

  const exactSuggestions = suggestions.filter((s) => s.evidence.some((e) => EVIDENCE_IS_EXACT[e]));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Client Database</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            One row per business entity · order metrics derived from the deal tickets, never stored
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton onExport={(f) => exportRows(f)} disabled={exporting} />
          <button onClick={() => setSeeding(true)} className={btnGhost}>Seed from leads</button>
          <button onClick={() => setUploading(true)} className={btnGhost}>Bulk Upload</button>
          <button onClick={() => setMerging(true)} className={btnGhost}>
            Merge
            {!!exactSuggestions.length && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">{exactSuggestions.length}</span>}
          </button>
          <button onClick={() => setAddingNew(true)} className={btnPrimary}>+ Add Client</button>
        </div>
      </div>

      {loadError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          Could not load the Client Database: {loadError}.{' '}
          <button onClick={load} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {!!capped && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-900">
          {capped} contact number{capped === 1 ? '' : 's'}{' '}beyond the {ORDER_DETAIL_PHONE_CAP}-number cap were not{' '}
          date-checked, so those clients show a status of <span className="font-semibold">Unknown</span> rather than a
          guess. Expanding a client always reads its own tickets in full.
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, contact, number or GST…"
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] w-full sm:w-[280px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ClientStatus)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All statuses</option>
          {(['Active', 'Inactive', 'Unknown'] as ClientStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All segments</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All types</option>
          {CLIENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={kamFilter} onChange={(e) => setKamFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All KAMs</option>
          <option value="unassigned">Unassigned</option>
          {kamOptions.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <span className="text-[11px] text-gray-400 ml-auto">{rows.length} of {clients.length}</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading clients…</p>
      ) : !clients.length ? (
        <div className="bg-white rounded-lg border border-gray-200 py-12 px-6 text-center">
          <p className="text-[13px] font-semibold text-gray-600">The Client Database is empty.</p>
          <p className="text-[12px] text-gray-400 mt-1 max-w-[520px] mx-auto">
            Seed it from the closed Inbound / Outreach leads and the KAM board, upload the §7 template, or add a
            client by hand. Nothing about this list is guessed: a client exists once somebody says it does.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setSeeding(true)} className={btnPrimary}>Seed from leads</button>
            <button onClick={() => setUploading(true)} className={btnGhost}>Bulk Upload</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[1040px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                  <th className="text-left font-semibold px-3 py-2">Company</th>
                  <th className="text-left font-semibold px-3 py-2">Contact person</th>
                  <th className="text-left font-semibold px-3 py-2">Contact number</th>
                  <th className="text-left font-semibold px-3 py-2">Last order</th>
                  <th className="text-right font-semibold px-3 py-2">Orders</th>
                  <th className="text-right font-semibold px-3 py-2">Total revenue</th>
                  <th className="text-right font-semibold px-3 py-2">Avg order</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                  <th className="text-left font-semibold px-3 py-2">Seg</th>
                  <th className="text-left font-semibold px-3 py-2">KAM</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, metrics, status, days }) => {
                  const primary = primaryContact(client.contacts);
                  const isOpen = expanded === client.id;
                  const temp = currentTemperature(client.interactions);
                  const numbers = contactNumbers(client.contacts);
                  return (
                    <Fragment key={client.id}>
                      <tr
                        onClick={() => toggleExpand(client)}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-gray-50' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-300 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                            <span className="font-semibold text-gray-800">{client.company || <span className="text-gray-300">(unnamed)</span>}</span>
                            {temp && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                                style={{ background: temperatureColor(temp.value) + '1A', color: temperatureColor(temp.value) }}
                                title={`Account temperature ${temp.value}/10, scored ${temp.at}`}
                              >
                                {temp.value}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {client.source}
                            {client.clientType && ` · ${client.clientType}`}
                            {numbers.length > 1 && ` · ${numbers.length} numbers`}
                            {!!gstNumbers(client.gsts).length && ` · ${gstNumbers(client.gsts).length} GST`}
                            {!!(client.mergedFrom || []).length && ` · merged ×${(client.mergedFrom || []).length}`}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{contactLabel(primary) || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{primary?.number || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap"><Metric value={metrics.lastOrderPlaced} state={metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700"><Metric value={metrics.orders} state={metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap"><Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600 whitespace-nowrap"><Metric value={metrics.averageOrderValue} state={metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2"><StatusPill status={status} days={days} /></td>
                        <td className="px-3 py-2 text-gray-600">{client.segment || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{client.kam || <span className="text-gray-300">unassigned</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditing(client); }}
                            className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={11} className="px-3 pb-4 pt-1">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                              <div className="bg-white rounded-md border border-gray-200 p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Business entity · §3.1</div>
                                <div className="text-[13px] font-semibold text-gray-800">{client.company}</div>
                                <div className="text-[11px] text-gray-400 mb-2">
                                  {client.clientType || 'type not set'} · Segment {client.segment || '—'} · {client.source}
                                </div>

                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">Contact numbers</div>
                                {(client.contacts || []).map((c) => (
                                  <div key={c.number} className="text-[11px] text-gray-600">
                                    <span className="font-mono">{c.number}</span>
                                    {contactLabel(c) && <span className="text-gray-400"> · {contactLabel(c)}</span>}
                                    {c.primary && <span className="ml-1 text-[9px] font-bold text-[#0F766E]">PRIMARY</span>}
                                  </div>
                                ))}

                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">GST numbers</div>
                                {!(client.gsts || []).length ? (
                                  <p className="text-[11px] text-gray-300">None on file.</p>
                                ) : (
                                  (client.gsts || []).map((g) => {
                                    const v = validateGst(g.number);
                                    return (
                                      <div key={g.number} className="text-[11px] text-gray-600">
                                        <span className="font-mono">{g.number}</span>
                                        {v.stateName && <span className="text-gray-400"> · {v.stateName}</span>}
                                        {v.check === 'bad-checksum' && <span className="text-amber-600"> · check digit disagrees</span>}
                                        <div className="text-[10px] text-gray-400">
                                          {g.registeredName
                                            ? `Registered as ${g.registeredName}`
                                            : 'Registered company name unavailable — no GST Validator in this stack'}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}

                                {client.remarks && (
                                  <>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">Remarks</div>
                                    <p className="text-[11px] text-gray-600 break-words">{client.remarks}</p>
                                  </>
                                )}
                              </div>

                              <div className="bg-white rounded-md border border-gray-200 p-3 lg:col-span-2">
                                <OrderDetailsTable
                                  rows={detailsByClient[client.id]?.rows || []}
                                  failedPhones={detailsByClient[client.id]?.failedPhones || []}
                                  rejected={detailsByClient[client.id]?.rejected || 0}
                                  loading={!!detailLoading[client.id]}
                                  onRecheck={() => loadDetails(client, true)}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3">
        {`Client status is system-computed: Active means an ordered deal ticket within the last ${ACTIVE_WINDOW_MONTHS} months.`}{' '}
        The PRD says the window is measured “from Last Order Placed”, which read literally would make every client who
        ever ordered permanently Active — so it is anchored to today, which is the only reading under which the PRD&apos;s
        own “re-evaluates on daily rollover” does anything. Flagged for KK.
      </p>

      {addingNew && (
        <ClientModal client={blank()} isNew onClose={() => setAddingNew(false)} onSave={saveClient} />
      )}
      {editing && (
        <ClientModal client={editing} onClose={() => setEditing(null)} onSave={saveClient} />
      )}
      {merging && (
        <MergeModal clients={clients} suggestions={suggestions} onClose={() => setMerging(false)} onMerge={runMerge} />
      )}
      {uploading && (
        <UploadModal
          existing={clients}
          onClose={() => setUploading(false)}
          onImport={async (result) => {
            const errors: Record<string, string> = {};
            const saved: ClientEntity[] = [];
            for (const e of result.entities) {
              if (!e.client || e.saveError) continue;
              const err = await upsertClient(e.client);
              if (err) errors[e.client.id] = err; else saved.push(e.client);
            }
            if (saved.length) {
              setClients((prev) => {
                const ids = new Set(saved.map((c) => c.id));
                return [...saved, ...prev.filter((c) => !ids.has(c.id))];
              });
              load();
            }
            return errors;
          }}
        />
      )}
      {seeding && (
        <SeedModal
          onClose={() => { setSeeding(false); load(); }}
          onSeed={async (plan) => {
            const errors: string[] = [];
            let saved = 0;
            for (const cand of plan.create) {
              const client = clientFromSeed(cand);
              const err = await upsertClient(client);
              if (err) errors.push(`${cand.company}: ${err}`); else saved++;
            }
            return { saved, errors };
          }}
        />
      )}
    </div>
  );
}
