'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  KAM_STAGES, KAM_STAGE_COLORS, KAMS,
  fmtL, type KamClient, type KamStage, type KamSource,
} from './mockData';
import { fetchKamClients, upsertKamClient } from '@/lib/b2bLeads';

// Bulk-upload column order (0-indexed). Only Client Name is required.
const UPLOAD_COLUMNS = [
  'Client Name', 'Contact Person', 'Phone', 'ENQ ID', 'Value',
  'Expected Closure (YYYY-MM-DD)', 'PI Status', 'KAM', 'Notes',
];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === ',') { out.push(cur); cur = ''; }
    else if (ch === '"') q = true;
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function rowsToClients(rows: string[][]): KamClient[] {
  const out: KamClient[] = [];
  const stamp = Date.now();
  rows.forEach((r, i) => {
    const company = (r[0] || '').trim();
    if (!company) return;
    if (i === 0 && company.toLowerCase() === 'client name') return; // skip header row
    const stageRaw = (r[6] || '').trim();
    const stage = (KAM_STAGES as string[]).includes(stageRaw) ? (stageRaw as KamStage) : 'No Active Enquiry';
    const kamRaw = (r[7] || '').trim();
    const kam = KAMS.includes(kamRaw) ? kamRaw : KAMS[0];
    const note = (r[8] || '').trim();
    out.push({
      id: `KAM-${stamp}-${i}`,
      company,
      contactName: (r[1] || '').trim(),
      phone: (r[2] || '').trim(),
      enqId: (r[3] || '').trim() || undefined,
      value: Number((r[4] || '').replace(/[^\d.]/g, '')) || 0,
      expectedClosure: (r[5] || '').trim() || undefined,
      stage,
      kam,
      source: 'Existing',
      notes: note ? [{ ts: 'just now', author: kam, text: note }] : [],
    });
  });
  return out;
}

function UploadModal({ onClose, onImport }: { onClose: () => void; onImport: (clients: KamClient[]) => void }) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false, defval: '' });
      setFileRows(rows);
      setFileName(file.name);
    } catch {
      setError('Could not read that file. Use .xlsx, .xls or .csv.');
    }
  };

  const doImport = () => {
    const rows = fileRows ?? text.split(/\r?\n/).filter((l) => l.trim()).map(splitCsvLine);
    const clients = rowsToClients(rows);
    if (!clients.length) { setError('No valid rows found (Client Name is required).'); return; }
    onImport(clients);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[560px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Upload Client Database</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4 min-w-0">
          <div className="text-[12px] text-gray-500 min-w-0">
            <p className="mb-1">Upload an <span className="font-semibold">Excel / CSV</span> file, or paste rows below. Columns in this order (only <span className="font-semibold">Client Name</span> required):</p>
            <div className="text-[11px] text-gray-600 bg-gray-50 rounded-md p-2 overflow-x-auto whitespace-nowrap">
              {UPLOAD_COLUMNS.map((c, i) => (
                <span key={c}>
                  <span className="text-gray-400">{i + 1}.</span> {c}{i < UPLOAD_COLUMNS.length - 1 ? <span className="text-gray-300">{'  ·  '}</span> : ''}
                </span>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold"
            />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {fileRows?.length ?? 0} rows</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows (comma-separated, one per line)</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); }}
              rows={5}
              placeholder={'Metro Constructions, Rahul Nair, 9900099013, ENQ-3980, 265000, 2026-08-01, PI Shared, Jadhav, Sample shared\nSilverline Homes, Ananya Rao, 9900099002, , 0, , No Active Enquiry, Sidhant,'}
              className={inputCls + ' resize-none font-mono text-[11px]'}
            />
          </label>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={doImport} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Import</button>
        </div>
      </div>
    </div>
  );
}

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

function ClientCard({ client, onClick, onDragStart }: { client: KamClient; onClick: () => void; onDragStart: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
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
  client, isNew, onClose, onSave,
}: {
  client: KamClient;
  isNew?: boolean;
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
          <h2 className="text-base font-bold text-gray-800">{isNew ? 'Log Client Enquiry' : draft.company}</h2>
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
          <button onClick={save} disabled={isNew && !draft.company.trim()} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">{isNew ? 'Save' : 'Save Changes'}</button>
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
  const [clients, setClients] = useState<KamClient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<KamStage | null>(null);

  useEffect(() => { fetchKamClients().then(setClients); }, []);

  const moveClient = (id: string, stage: KamStage) =>
    setClients((prev) => prev.map((c) => {
      if (c.id !== id || c.stage === stage) return c;
      const updated = { ...c, stage };
      upsertKamClient(updated);
      return updated;
    }));

  const handleDrop = (stage: KamStage) => {
    if (dragId) moveClient(dragId, stage);
    setDragId(null);
    setDragOverStage(null);
  };

  const blankClient = (): KamClient => ({
    id: `KAM-${Date.now()}`,
    company: '', contactName: '', phone: '',
    value: 0, stage: 'No Active Enquiry', kam: KAMS[0], source: 'Existing', notes: [],
  });

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
          <button onClick={() => setUploading(true)} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 whitespace-nowrap">Upload Client List</button>
          <button onClick={() => setAdding(true)} className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap">+ Log Enquiry</button>
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
          const isOver = dragOverStage === s;
          return (
            <div
              key={s}
              className="w-[230px] shrink-0"
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(s); }}
              onDragLeave={() => setDragOverStage((cur) => (cur === s ? null : cur))}
              onDrop={() => handleDrop(s)}
            >
              <div className={`bg-white rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
                <div className="h-1" style={{ background: KAM_STAGE_COLORS[s] }} />
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s}</span>
                  <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[80px]">
                  {items.length === 0
                    ? <div className="text-[11px] text-gray-300 text-center py-4">{isOver ? 'Drop here' : 'No clients'}</div>
                    : items.map((c) => (
                      <ClientCard
                        key={c.id}
                        client={c}
                        onClick={() => setSelectedId(c.id)}
                        onDragStart={() => setDragId(c.id)}
                      />
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {uploading && (
        <UploadModal
          onClose={() => setUploading(false)}
          onImport={(imported) => {
            setClients((prev) => [...imported, ...prev]);
            imported.forEach((c) => upsertKamClient(c));
            setUploading(false);
          }}
        />
      )}

      {adding && (
        <ClientModal
          client={blankClient()}
          isNew
          onClose={() => setAdding(false)}
          onSave={(patch) => {
            const created = { ...blankClient(), ...patch } as KamClient;
            setClients((prev) => [created, ...prev]);
            upsertKamClient(created);
            setAdding(false);
          }}
        />
      )}

      {selected && (
        <ClientModal
          client={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => {
            const updated = { ...selected, ...patch };
            setClients((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
            upsertKamClient(updated);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
