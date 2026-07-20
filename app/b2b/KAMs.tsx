'use client';

import { useMemo, useState } from 'react';
import {
  KAM_CLIENTS, KAM_STAGES, KAM_STAGE_COLORS, KAMS,
  fmtL, type KamClient, type KamStage, type KamSource,
} from './mockData';

const SOURCE_COLORS: Record<KamSource, string> = {
  Existing: '#6B7280',
  Inbound:  '#3B82F6',
  Outbound: '#8B5CF6',
};

function SourceBadge({ s }: { s: KamSource }) {
  const c = SOURCE_COLORS[s];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c + '18', color: c }}>
      {s}
    </span>
  );
}

function ClientCard({ client, onClick }: { client: KamClient; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="text-[13px] font-semibold text-gray-800 leading-tight">{client.company}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">KAM: {client.kam} · {client.enqId || '—'}</div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-mono font-semibold text-gray-700">{fmtL(client.value)}</span>
        <SourceBadge s={client.source} />
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ClientModal({
  client, onClose, onSave,
}: {
  client: KamClient;
  onClose: () => void;
  onSave: (patch: Partial<KamClient>) => void;
}) {
  const [draft, setDraft] = useState<KamClient>(client);
  const [noteText, setNoteText] = useState('');

  const set = <K extends keyof KamClient>(k: K, v: KamClient[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    const text = noteText.trim();
    const notes = text ? [...(draft.notes || []), { ts: 'just now', author: draft.kam, text }] : draft.notes;
    onSave({ ...draft, notes });
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[560px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">{draft.company}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Client name">
            <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contact person">
              <input value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ENQ ID">
              <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Value (₹)">
              <input type="number" min={0} value={draft.value || ''} onChange={(e) => set('value', Number(e.target.value) || 0)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Expected date of closure">
              <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value)} className={inputCls} />
            </Field>
            <Field label="PI status">
              <select value={draft.stage} onChange={(e) => set('stage', e.target.value as KamStage)} className={inputCls}>
                {KAM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="KAM">
            <select value={draft.kam} onChange={(e) => set('kam', e.target.value)} className={inputCls}>
              {KAMS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>

          <Field label="Notes">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} className={inputCls + ' resize-none'} />
          </Field>

          {(draft.notes || []).length > 0 && (
            <div className="flex flex-col gap-2">
              {(draft.notes || []).slice().reverse().map((n, i) => (
                <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
                  <div className="text-gray-700">{n.text}</div>
                  <div className="text-gray-400 mt-1">{n.author} · {n.ts}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      <div className="text-2xl font-bold text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}

export default function KAMs() {
  const [clients, setClients] = useState<KamClient[]>(KAM_CLIENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byStage = useMemo(
    () => (s: KamStage) => clients.filter((c) => c.stage === s),
    [clients],
  );

  const selected = clients.find((c) => c.id === selectedId) || null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">KAMs</h1>
          <p className="text-xs text-gray-400 mt-0.5">Existing clients &amp; converted leads</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 whitespace-nowrap">Upload Client List</button>
          <button className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap">+ Log Enquiry</button>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <StatTile label="Total Clients" value={clients.length} />
        {KAM_STAGES.map((s) => <StatTile key={s} label={s} value={byStage(s).length} />)}
      </div>

      {/* ── Client board ── */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {KAM_STAGES.map((s) => {
          const items = byStage(s);
          return (
            <div key={s} className="w-[230px] shrink-0">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="h-1" style={{ background: KAM_STAGE_COLORS[s] }} />
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s}</span>
                  <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[80px]">
                  {items.length === 0
                    ? <div className="text-[11px] text-gray-300 text-center py-4">No clients</div>
                    : items.map((c) => <ClientCard key={c.id} client={c} onClick={() => setSelectedId(c.id)} />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <ClientModal
          client={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => {
            setClients((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
