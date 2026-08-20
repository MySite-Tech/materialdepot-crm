'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  KAM_STAGES, KAM_STAGE_COLORS, KAMS,
  fmtL, type KamClient, type KamStage, type KamSource,
} from './mockData';
import {
  fetchKamClients, upsertKamClient, fetchClientOrderHistories, normalizeClientPhone, istToday,
  type ClientOrderHistory,
} from '@/lib/b2bLeads';
import { useDragAutoScroll, exportRowsCsv, todayStr } from './exportUtils';
import {
  UPLOAD_COLUMNS, parseDelimited, validateRows, summarize,
  IMPORT_LOG_HEADERS, importLogRows,
  type ParsedRow, type RowSeverity,
} from './kamImport';
import { planAdvances, applyAdvance } from './kamAutoStage';
import {
  scoreAccount, ESCALATION_CATEGORIES, ESCALATION_TIERS, HEALTH_META,
  type Escalation, type EscalationCategory, type EscalationTier, type HealthStatus,
} from './accountHealth';

const SEVERITY_DOT: Record<RowSeverity, string> = {
  ok:    '#22C55E',
  warn:  '#F59E0B',
  error: '#EF4444',
};

function SummaryChip({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md text-[11px]" style={{ background: tone + '14', color: tone }}>
      <span className="font-bold font-mono">{count}</span>
      <span className="font-medium">{label}</span>
    </span>
  );
}

function RowLog({ rows }: { rows: ParsedRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="max-h-[260px] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
              <th className="text-left font-semibold px-2 py-1.5 w-10">Row</th>
              <th className="text-left font-semibold px-2 py-1.5">Client</th>
              <th className="text-left font-semibold px-2 py-1.5">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.line} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-1.5 font-mono text-gray-400">{r.line}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.saveError ? SEVERITY_DOT.error : SEVERITY_DOT[r.severity] }} />
                      <span className="text-gray-700 font-medium">{r.company || <span className="text-gray-300">(blank)</span>}</span>
                    </span>
                    {r.isUpdate && <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#0F766E]">update</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.saveError && <div className="text-red-600">Could not save: {r.saveError}</div>}
                    {r.issues.map((issue, i) => (
                      <div key={i} className={issue.severity === 'error' ? 'text-red-600' : 'text-amber-700'}>
                        <span className="text-gray-400">{issue.column}:</span> {issue.message}
                      </div>
                    ))}
                    {!r.saveError && !r.issues.length && <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadModal({ existing, onClose, onImport }: {
  existing: KamClient[];
  onClose: () => void;
  onImport: (clients: KamClient[]) => Promise<Record<string, string>>;
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
        // Read CSV as UTF-8 text rather than handing bytes to XLSX, which
        // guesses a codepage and mangles non-ASCII client names.
        setFileRows(parseDelimited(await file.text()));
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('the first sheet is empty');
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
    if (!rows.length) return { rows: [] as ParsedRow[], skipped: 0 };
    return validateRows(rows, existing);
  }, [fileRows, text, existing]);

  const rowsWithSave = useMemo(() => {
    if (!saveErrors) return parsed.rows;
    return parsed.rows.map((r) => (r.client && saveErrors[r.client.id] ? { ...r, saveError: saveErrors[r.client.id] } : r));
  }, [parsed.rows, saveErrors]);

  const summary = useMemo(() => summarize(rowsWithSave, parsed.skipped), [rowsWithSave, parsed.skipped]);
  const importable = rowsWithSave.filter((r) => r.client && !r.saveError);

  const doImport = async () => {
    if (!importable.length) return;
    setSaving(true);
    try {
      const errors = await onImport(importable.map((r) => r.client!));
      if (Object.keys(errors).length) setSaveErrors(errors);
      else onClose();
    } finally {
      setSaving(false);
    }
  };

  const downloadLog = () => {
    exportRowsCsv(IMPORT_LOG_HEADERS, importLogRows(rowsWithSave), `kam-import-log-${todayStr()}`);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
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
            <p className="mt-1 text-[11px] text-gray-400">A header row is detected and skipped automatically. Dates may be YYYY-MM-DD or DD/MM/YYYY. Rows matching an existing client by phone (or name) are updated, not duplicated.</p>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold"
            />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {parsed.rows.length} data row{parsed.rows.length === 1 ? '' : 's'}{parsed.skipped ? ` · ${parsed.skipped} header/blank skipped` : ''}</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows (comma-separated, one per line)</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); setFileError(''); setSaveErrors(null); }}
              rows={4}
              placeholder={'Metro Constructions, Rahul Nair, 9900099013, ENQ-3980, 265000, 2026-08-01, PI Shared, Jadhav, Sample shared\nSilverline Homes, Ananya Rao, 9900099002, , 0, , No Active Enquiry, Sidhant,'}
              className={inputCls + ' resize-none font-mono text-[11px]'}
            />
          </label>

          {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}

          {!!rowsWithSave.length && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <SummaryChip label="ready" count={summary.valid - summary.failed} tone="#22C55E" />
                  {!!summary.updates && <SummaryChip label="updates" count={summary.updates} tone="#0F766E" />}
                  {!!summary.warnings && <SummaryChip label="warnings" count={summary.warnings} tone="#F59E0B" />}
                  {!!summary.errors && <SummaryChip label="rejected" count={summary.errors} tone="#EF4444" />}
                  {!!summary.failed && <SummaryChip label="failed to save" count={summary.failed} tone="#EF4444" />}
                </div>
                <button onClick={downloadLog} className="text-[11px] font-semibold text-[#0F766E] hover:underline whitespace-nowrap">Download log (.csv)</button>
              </div>
              <RowLog rows={rowsWithSave} />
              {!!summary.errors && (
                <p className="text-[11px] text-gray-400">Rejected rows are skipped. Fix them in the sheet and upload again — already-imported clients will be updated, not duplicated.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            {saveErrors ? `${summary.failed} row(s) could not be saved.` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">{saveErrors ? 'Close' : 'Cancel'}</button>
            <button
              onClick={doImport}
              disabled={saving || !importable.length}
              className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50"
            >
              {saving ? 'Importing…' : importable.length ? `Import ${importable.length} row${importable.length === 1 ? '' : 's'}` : 'Import'}
            </button>
          </div>
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

// Lifetime order line. Three distinct states, all meaningful: no phone means we
// can never match deal tickets for this client, loading means the aggregate is
// still in flight, and a zero-order client is a real answer worth showing.
function OrderHistoryLine({ client, history, loading }: {
  client: KamClient;
  history?: ClientOrderHistory;
  loading: boolean;
}) {
  const hasPhone = normalizeClientPhone(client.phone).length === 10;

  let body: React.ReactNode;
  if (!hasPhone) {
    body = <span className="text-[10px] text-gray-300" title="No valid phone on this client, so deal tickets can't be matched">No phone</span>;
  } else if (!history) {
    body = <span className="text-[10px] text-gray-300">{loading ? 'Loading…' : '—'}</span>;
  } else if (history.orders === 0) {
    body = <span className="text-[10px] text-gray-400">{history.enquiries > 0 ? `${history.enquiries} enq · no orders` : 'No orders yet'}</span>;
  } else {
    body = (
      <span className="text-[11px] font-mono font-semibold text-[#0F766E]" title={`${history.orders} order${history.orders === 1 ? '' : 's'} won · ${history.enquiries} enquir${history.enquiries === 1 ? 'y' : 'ies'} all time`}>
        {fmtL(history.lifetimeValue)}
        <span className="font-sans font-normal text-gray-400"> · {history.orders} {history.orders === 1 ? 'order' : 'orders'}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Orders till date</span>
      {body}
    </div>
  );
}

// Green needs no ink — only amber and red are worth a mark on the card.
function HealthDot({ status, title }: { status: HealthStatus; title: string }) {
  if (status === 'green') return null;
  const meta = HEALTH_META[status];
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0 mt-1"
      style={{ background: meta.color }}
      title={`${meta.label} — ${title}`}
    />
  );
}

function ClientCard({ client, history, historyLoading, today, onClick, onDragStart }: {
  client: KamClient;
  history?: ClientOrderHistory;
  historyLoading: boolean;
  today: string;
  onClick: () => void;
  onDragStart: () => void;
}) {
  const health = scoreAccount(client.escalations, today);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <HealthDot status={health.status} title={health.reason} />
        <div className="text-[13px] font-semibold text-gray-800 leading-tight">{client.company}</div>
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">KAM: {client.kam} · {client.enqId || '—'}</div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-mono font-semibold text-gray-700">{fmtL(client.value)}</span>
        <SourceBadge s={client.source} />
      </div>
      <OrderHistoryLine client={client} history={history} loading={historyLoading} />
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

// ── Escalations (drives the account health meter) ─────────────────────────────

function EscalationSection({ draft, set, today }: {
  draft: KamClient;
  set: <K extends keyof KamClient>(k: K, v: KamClient[K]) => void;
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<EscalationCategory>(ESCALATION_CATEGORIES[0]);
  const [tier, setTier] = useState<EscalationTier>(2);
  const [raisedAt, setRaisedAt] = useState(today);
  const [note, setNote] = useState('');

  const escalations = draft.escalations || [];
  const health = scoreAccount(escalations, today);
  const meta = HEALTH_META[health.status];

  const add = () => {
    const entry: Escalation = {
      id: `ESC-${Date.now()}`,
      raisedAt: raisedAt || today,
      category,
      tier,
      note: note.trim() || undefined,
      loggedBy: draft.kam,
    };
    set('escalations', [...escalations, entry]);
    setAdding(false);
    setNote('');
    setTier(2);
    setCategory(ESCALATION_CATEGORIES[0]);
    setRaisedAt(today);
  };

  const patch = (id: string, changes: Partial<Escalation>) =>
    set('escalations', escalations.map((e) => (e.id === id ? { ...e, ...changes } : e)));

  const remove = (id: string) => set('escalations', escalations.filter((e) => e.id !== id));

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Escalations · {health.escalationCount}
        </span>
        <button onClick={() => setAdding((v) => !v)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
          {adding ? 'Cancel' : '+ Log escalation'}
        </button>
      </div>

      {/* Live health readout, so the effect of logging or resolving is immediate. */}
      <div
        className="flex items-center justify-between gap-2 rounded-md px-3 py-2 mb-2"
        style={{ background: meta.color + '0F' }}
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: meta.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
        <span className="text-[10px] text-gray-500 text-right">
          {health.reason}
          {health.daysToRecovery !== null && ` · recovers in ${health.daysToRecovery}d`}
        </span>
      </div>

      {adding && (
        <div className="border border-gray-200 rounded-md p-3 mb-2 flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as EscalationCategory)} className={inputCls}>
                {ESCALATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Tier</span>
              <select value={tier} onChange={(e) => setTier(Number(e.target.value) as EscalationTier)} className={inputCls}>
                {ESCALATION_TIERS.map((t) => (
                  <option key={t} value={t}>Tier {t}{t === 1 ? ' — critical' : ''}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Raised on</span>
            <input type="date" max={today} value={raisedAt} onChange={(e) => setRaisedAt(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">What happened</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </label>
          <div className="flex justify-end">
            <button onClick={add} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-[#0F766E] text-white">Add escalation</button>
          </div>
          <p className="text-[10px] text-gray-400">An unresolved tier-1 keeps the account Critical until it is resolved, whatever its age.</p>
        </div>
      )}

      {!escalations.length ? (
        <p className="text-[11px] text-gray-300 py-1">No escalations logged.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {escalations.slice().sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)).map((e) => {
            const open = !e.resolvedAt;
            return (
              <div key={e.id} className="border border-gray-100 rounded-md p-2 text-[11px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">{e.category}</span>
                    <span
                      className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{
                        background: e.tier === 1 ? '#EF444418' : '#6B728018',
                        color: e.tier === 1 ? '#EF4444' : '#6B7280',
                      }}
                    >
                      T{e.tier}
                    </span>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Raised {e.raisedAt}
                      {e.resolvedAt ? ` · resolved ${e.resolvedAt}` : ' · open'}
                      {e.loggedBy && ` · ${e.loggedBy}`}
                    </div>
                    {e.note && <div className="text-gray-600 mt-1 break-words">{e.note}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {open ? (
                      <button
                        onClick={() => patch(e.id, { resolvedAt: today })}
                        className="text-[10px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Mark resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => patch(e.id, { resolvedAt: undefined })}
                        className="text-[10px] font-semibold text-gray-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Reopen
                      </button>
                    )}
                    <button onClick={() => remove(e.id)} className="text-[10px] text-gray-300 hover:text-red-500 cursor-pointer">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientModal({
  client, isNew, today, onClose, onSave,
}: {
  client: KamClient;
  isNew?: boolean;
  today: string;
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

          {!isNew && <EscalationSection draft={draft} set={set} today={today} />}

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
  const [histories, setHistories] = useState<Record<string, ClientOrderHistory>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const today = istToday();
  const [kamFilter, setKamFilter] = useState<string>('all');
  const [autoAdvanced, setAutoAdvanced] = useState(0);

  useEffect(() => { fetchKamClients().then(setClients); }, []);

  // Keyed on the sorted distinct phone list, not on `clients`, so dragging a card
  // between columns or editing a note doesn't refire a board-wide refetch.
  const phoneKey = useMemo(
    () => [...new Set(clients.map((c) => normalizeClientPhone(c.phone)).filter((k) => k.length === 10))]
      .sort().join(','),
    [clients],
  );

  useEffect(() => {
    if (!phoneKey) { setHistoryLoading(false); return; }
    let alive = true;
    setHistoryLoading(true);
    fetchClientOrderHistories(phoneKey.split(','))
      .then((h) => {
        if (!alive) return;
        setHistories((prev) => ({ ...prev, ...h }));

        // Auto-advance the board off the client's furthest deal status. Forward
        // only, and never out of Closed/Lost — see kamAutoStage.ts. Persisted so
        // the move is stable and the audit note isn't re-added on the next load.
        setClients((prev) => {
          const advances = planAdvances(
            prev,
            (c) => h[normalizeClientPhone(c.phone)]?.furthestStatus,
          );
          if (!advances.length) return prev;
          const moved = new Map(advances.map((a) => {
            const updated = applyAdvance(a);
            upsertKamClient(updated);
            return [a.client.id, updated];
          }));
          setAutoAdvanced(advances.length);
          return prev.map((c) => moved.get(c.id) ?? c);
        });
      })
      .finally(() => { if (alive) setHistoryLoading(false); });
    return () => { alive = false; };
  }, [phoneKey]);

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

  // Every KAM seen in the data, plus the configured roster, so a client owned by
  // someone no longer in KAMS is still reachable in the filter.
  const kamOptions = useMemo(() => {
    const seen = new Set<string>(KAMS);
    clients.forEach((c) => c.kam && seen.add(c.kam));
    return [...seen].sort();
  }, [clients]);

  const ownedClients = useMemo(
    () => (kamFilter === 'all' ? clients : clients.filter((c) => c.kam === kamFilter)),
    [clients, kamFilter],
  );

  const countsByKam = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach((c) => { counts[c.kam] = (counts[c.kam] || 0) + 1; });
    return counts;
  }, [clients]);

  // Board and summary tiles both read the owner-filtered list, so the numbers
  // always describe what is actually on screen.
  const byStage = useMemo(
    () => (s: KamStage) => ownedClients.filter((c) => c.stage === s),
    [ownedClients],
  );

  const selected = clients.find((c) => c.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

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

      {/* ── Account ownership: filter the board to one KAM ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">KAM</span>
        <select
          value={kamFilter}
          onChange={(e) => setKamFilter(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] cursor-pointer"
        >
          <option value="all">All KAMs ({clients.length})</option>
          {kamOptions.map((k) => (
            <option key={k} value={k}>{k} ({countsByKam[k] || 0})</option>
          ))}
        </select>
        {kamFilter !== 'all' && (
          <button onClick={() => setKamFilter('all')} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
            Clear
          </button>
        )}
        {!!autoAdvanced && (
          <span className="text-[11px] text-gray-400 ml-auto">
            {autoAdvanced} account{autoAdvanced === 1 ? '' : 's'} auto-advanced from cart status
          </span>
        )}
      </div>

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <StatTile label="Total Clients" value={ownedClients.length} />
        {KAM_STAGES.map((s) => <StatTile key={s} label={s} value={byStage(s).length} />)}
      </div>

      {/* ── Client board ── */}
      <div
        ref={kanbanScroll.ref}
        className="flex gap-3 overflow-x-auto pb-3"
        onDragOver={kanbanScroll.onDragOver}
        onDragEnd={kanbanScroll.onDragEnd}
        onDrop={kanbanScroll.onDrop}
      >
        {KAM_STAGES.map((s) => {
          const items = byStage(s);
          const isOver = dragOverStage === s;
          return (
            <div
              key={s}
              className="w-[210px] shrink-0"
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
                        history={histories[normalizeClientPhone(c.phone)]}
                        historyLoading={historyLoading}
                        today={today}
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
          existing={clients}
          onClose={() => setUploading(false)}
          onImport={async (imported) => {
            // Awaited, so the modal can report which rows actually persisted
            // rather than claiming success on a fire-and-forget write.
            const settled = await Promise.all(
              imported.map(async (c) => [c.id, await upsertKamClient(c)] as const),
            );
            const errors: Record<string, string> = {};
            const saved: KamClient[] = [];
            for (const [id, error] of settled) {
              const client = imported.find((c) => c.id === id)!;
              if (error) errors[id] = error; else saved.push(client);
            }
            if (saved.length) {
              const savedIds = new Set(saved.map((c) => c.id));
              setClients((prev) => [...saved, ...prev.filter((c) => !savedIds.has(c.id))]);
            }
            return errors;
          }}
        />
      )}

      {adding && (
        <ClientModal
          client={blankClient()}
          isNew
          today={today}
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
          today={today}
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
