'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClients, fetchKamOrders, upsertClient, upsertKamOrder, lookupEnqId,
  fetchClientOrderHistories, fetchClientOrderRows, orderDatesFromRows,
  clientMetricsFrom, ORDER_DETAIL_PHONE_CAP, resolveKamOrders, ENQ_RESOLVE_CAP,
  type ClientOrderHistory,
} from '@/lib/b2bLeads';
import { KAMS, fmtL, fmtINR } from './mockData';
import {
  contactNumbers, primaryContact, contactLabel, currentTemperature, temperatureColor,
  sortedInteractions, currentUpcomingProject, clampTemperature, istToday,
  CLIENT_STATUS_COLORS, CLIENT_STATUS_HINT,
  TEMPERATURE_BANDS, INTERACTION_TYPES, TEMPERATURE_MAX,
  type ClientEntity, type ClientInteraction, type ClientOrderMetrics,
  type ClientStatus, type InteractionType,
} from './clientModel';
import {
  KAM_VIEWS, KAM_ORDER_STATUSES, KAM_ORDER_STATUS_COLORS, KAM_ORDER_STATUS_HINT,
  KAM_ORDER_LOST_REASONS, KAM_OPEN_STATUSES, DAILY_CALL_TARGET,
  assignedClientRows, todaysCalls, followUpQueue, queueAgeBand, callsLoggedOn,
  kamOrderGateErrors, kamOrderStatusPrompts, interactionGateErrors, interactionPrompts,
  kamPipeline, temperatureMismatch, isLegacyKamStage,
  type AssignedClientRow, type CadenceRow, type KamOrder, type KamOrderStatus, type KamView,
} from './kamModel';
import { UPLOAD_COLUMNS, parseDelimited, validateRows, summarize, IMPORT_LOG_HEADERS, importLogRows, type ParsedRow } from './kamImport';
import { planAdvances, applyAdvance } from './kamAutoStage';
import { useDragAutoScroll, exportRowsCsv, exportRowsExcel, todayStr, ExportButton, LostReasonSelect, type ExportFormat } from './exportUtils';
import { scoreAccount, ESCALATION_CATEGORIES, ESCALATION_TIERS, HEALTH_META, type Escalation, type EscalationCategory, type EscalationTier } from './accountHealth';

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

function StatTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate" title={label}>{label}</div>
      <div className="text-xl font-bold mt-0.5" style={{ color: tone || '#1F2937' }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: ClientStatus }) {
  const c = CLIENT_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: c + '18', color: c }} title={CLIENT_STATUS_HINT[status]}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  );
}

/** §3.2 — the 0–10 reading, with the direction of travel when there is one. */
function TemperatureChip({ value, previous, at }: { value?: number; previous?: number; at?: string }) {
  if (typeof value !== 'number') {
    return <span className="text-[10px] text-gray-300" title="Never scored — §3.2">unscored</span>;
  }
  const c = temperatureColor(value);
  const delta = typeof previous === 'number' ? value - previous : undefined;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="px-1.5 py-0.5 rounded text-[11px] font-bold font-mono" style={{ background: c + '1A', color: c }}
        title={at ? `Scored ${value}/10 on ${at}` : `${value}/10`}>
        {value}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span className={`text-[10px] font-semibold ${delta < 0 ? 'text-red-600' : 'text-green-600'}`} title={`Previous reading ${previous}/10`}>
          {delta < 0 ? '▼' : '▲'}{Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

function Metric({ value, state, format }: { value: number | string | undefined; state: ClientOrderMetrics['dateState']; format?: (n: number) => string }) {
  if (value === undefined || value === null || value === '') {
    if (state === 'pending') return <span className="text-gray-300">…</span>;
    if (state === 'no-phone') return <span className="text-gray-300" title="No contact number, so orders cannot be linked">no phone</span>;
    if (state === 'unavailable') return <span className="text-blue-400" title="Could not be read from the deal tickets">unread</span>;
    return <span className="text-gray-300">—</span>;
  }
  return <span>{typeof value === 'number' && format ? format(value) : String(value)}</span>;
}

// ── §3.1 Log an interaction ───────────────────────────────────────────────────

function InteractionModal({ client, kam, today, onClose, onSave }: {
  client: ClientEntity;
  kam: string;
  today: string;
  onClose: () => void;
  onSave: (i: ClientInteraction) => Promise<string | null>;
}) {
  const [type, setType] = useState<InteractionType>('Call');
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState('');
  const [temperature, setTemperature] = useState<string>('');
  const [upcomingProject, setUpcomingProject] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const draft = { type, date, nextFollowUpDate, summary, temperature: temperature === '' ? undefined : Number(temperature) };
  const errors = interactionGateErrors(draft, today);
  const prompts = interactionPrompts(draft);
  const previous = currentTemperature(client.interactions);

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setError('');
    const err = await onSave({
      id: `INT-${Date.now()}`,
      type,
      date,
      summary: summary.trim() || undefined,
      temperature: temperature === '' ? undefined : clampTemperature(temperature),
      upcomingProject: upcomingProject.trim() || undefined,
      nextFollowUpDate: nextFollowUpDate || undefined,
      loggedBy: kam,
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[540px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Log an interaction</h2>
            <p className="text-[11px] text-gray-400">{client.company} · KAM PRD §3.1</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interaction type">
              <div className="flex rounded-md border border-gray-200 overflow-hidden">
                {INTERACTION_TYPES.map((t) => (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 px-2 py-1.5 text-[12px] font-semibold cursor-pointer ${type === t ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Date">
              <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Summary">
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="What was discussed" />
          </Field>

          <Field
            label="Account temperature"
            hint={`0 is very bad, ${TEMPERATURE_MAX} is very good.${previous ? ` Last reading ${previous.value}/10 on ${previous.at}.` : ' No reading on file yet.'}`}
          >
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={TEMPERATURE_MAX} step={1}
                value={temperature === '' ? 5 : Number(temperature)}
                onChange={(e) => setTemperature(e.target.value)}
                className="flex-1 cursor-pointer"
              />
              <span className="w-9 text-center text-[13px] font-bold font-mono"
                style={{ color: temperature === '' ? '#9CA3AF' : temperatureColor(Number(temperature)) }}>
                {temperature === '' ? '—' : temperature}
              </span>
              {temperature !== '' && (
                <button onClick={() => setTemperature('')} className="text-[10px] font-semibold text-gray-400 hover:underline cursor-pointer">clear</button>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              {TEMPERATURE_BANDS.map((b) => (
                <span key={b.key} className="text-[9px] font-semibold" style={{ color: b.color }}>{b.label}</span>
              ))}
            </div>
          </Field>

          <Field label="Upcoming project details" hint="§3.3 — anything the client has flagged as coming up. Leaving it blank keeps whatever is already on file.">
            <textarea value={upcomingProject} onChange={(e) => setUpcomingProject(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>

          <Field
            label={`Next follow-up date${type === 'Call' ? ' *' : ''}`}
            hint={type === 'Call'
              ? '§4.1 requires this on a logged call — it is what fills Today’s Calls and the Follow-up Queue.'
              : 'Optional on a meeting. §4.1 only requires it on a call.'}
          >
            <input type="date" min={date} value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} className={inputCls} />
          </Field>

          {!!errors.length && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {!errors.length && !!prompts.length && (
            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
              {prompts.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}

          <p className="text-[10px] text-gray-400">
            There is no reminder service in this CRM. A follow-up date puts the client in Today&apos;s Calls or the
            Follow-up Queue — nothing is sent to anyone.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length} className={btnPrimary}>{saving ? 'Saving…' : 'Log interaction'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Escalations (unchanged feature, moved onto the client) ────────────────────

function EscalationSection({ client, today, onSave }: {
  client: ClientEntity;
  today: string;
  onSave: (escalations: Escalation[]) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<EscalationCategory>(ESCALATION_CATEGORIES[0]);
  const [tier, setTier] = useState<EscalationTier>(2);
  const [raisedAt, setRaisedAt] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const escalations = client.escalations || [];
  const health = scoreAccount(escalations, today);
  const meta = HEALTH_META[health.status];

  const write = async (next: Escalation[]) => {
    setError('');
    const err = await onSave(next);
    if (err) setError(err);
  };

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Escalations · {health.escalationCount}</span>
        <button onClick={() => setAdding((v) => !v)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
          {adding ? 'Cancel' : '+ Log escalation'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 mb-2" style={{ background: meta.color + '0F' }}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: meta.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
        <span className="text-[10px] text-gray-500 text-right">
          {health.reason}{health.daysToRecovery !== null && ` · recovers in ${health.daysToRecovery}d`}
        </span>
      </div>

      {adding && (
        <div className="border border-gray-200 rounded-md p-3 mb-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value as EscalationCategory)} className={inputCls}>
                {ESCALATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tier">
              <select value={tier} onChange={(e) => setTier(Number(e.target.value) as EscalationTier)} className={inputCls}>
                {ESCALATION_TIERS.map((t) => <option key={t} value={t}>Tier {t}{t === 1 ? ' — critical' : ''}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Raised on">
            <input type="date" max={today} value={raisedAt} onChange={(e) => setRaisedAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="What happened">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                await write([...escalations, {
                  id: `ESC-${Date.now()}`, raisedAt: raisedAt || today, category, tier,
                  note: note.trim() || undefined, loggedBy: client.kam,
                }]);
                setAdding(false); setNote(''); setTier(2); setRaisedAt(today);
              }}
              className={btnPrimary}
            >
              Add escalation
            </button>
          </div>
        </div>
      )}

      {!escalations.length ? (
        <p className="text-[11px] text-gray-300">No escalations logged.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {[...escalations].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)).map((e) => (
            <div key={e.id} className="border border-gray-100 rounded-md p-2 text-[11px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-gray-700">{e.category}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: e.tier === 1 ? '#EF444418' : '#6B728018', color: e.tier === 1 ? '#EF4444' : '#6B7280' }}>
                    T{e.tier}
                  </span>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Raised {e.raisedAt}{e.resolvedAt ? ` · resolved ${e.resolvedAt}` : ' · open'}
                  </div>
                  {e.note && <div className="text-gray-600 mt-1 break-words">{e.note}</div>}
                </div>
                <button
                  onClick={() => write(escalations.map((x) => (x.id === e.id ? { ...x, resolvedAt: e.resolvedAt ? undefined : today } : x)))}
                  className="text-[10px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {e.resolvedAt ? 'Reopen' : 'Mark resolved'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">Could not save: {error}</p>}
    </div>
  );
}

// ── §3 Client detail drawer ───────────────────────────────────────────────────

function ClientDrawer({ row, orders, today, onClose, onLogInteraction, onSaveClient, onOpenOrder, onAddOrder }: {
  row: AssignedClientRow;
  orders: KamOrder[];
  today: string;
  onClose: () => void;
  onLogInteraction: () => void;
  onSaveClient: (c: ClientEntity) => Promise<string | null>;
  onOpenOrder: (o: KamOrder) => void;
  onAddOrder: () => void;
}) {
  const { client, metrics } = row;
  const log = sortedInteractions(client.interactions);
  const upcoming = currentUpcomingProject(client.interactions);
  const mismatch = temperatureMismatch(row);
  const [reassigning, setReassigning] = useState(false);
  const [nextKam, setNextKam] = useState(client.kam || '');
  const [error, setError] = useState('');

  const reassign = async () => {
    setError('');
    const err = await onSaveClient({
      ...client,
      kam: nextKam || undefined,
      assignments: [...(client.assignments || []), { kam: nextKam, at: new Date().toISOString(), reason: 'Reassigned from the KAM tab' }],
    });
    if (err) setError(err); else setReassigning(false);
  };

  return (
    <div className="fixed inset-0 z-[1150] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[640px] bg-white h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 truncate">{client.company}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusPill status={row.status} />
              <TemperatureChip value={row.temperature} previous={row.previousTemperature} at={row.temperatureAt} />
              <span className="text-[11px] text-gray-400">{client.source}</span>
              {client.segment && <span className="text-[11px] text-gray-400">· Segment {client.segment}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* §2 metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Orders" value={metrics.orders ?? '—'} />
            <StatTile label="Total revenue" value={metrics.totalRevenue !== undefined ? fmtL(metrics.totalRevenue) : '—'} />
            <StatTile label="Avg order" value={metrics.averageOrderValue !== undefined ? fmtL(metrics.averageOrderValue) : '—'} />
            <StatTile label="Last order" value={metrics.lastOrderPlaced || (metrics.dateState === 'unavailable' ? 'unread' : '—')} />
          </div>
          {metrics.dateState === 'unavailable' && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
              Some of this client&apos;s order dates could not be read, so the status is Unknown rather than a guess.
            </p>
          )}

          {/* Contact block */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Contacts</div>
            {(client.contacts || []).map((c) => (
              <div key={c.number} className="text-[12px] text-gray-600">
                <span className="font-mono">{c.number}</span>
                {contactLabel(c) && <span className="text-gray-400"> · {contactLabel(c)}</span>}
                {c.primary && <span className="ml-1 text-[9px] font-bold text-[#0F766E]">PRIMARY</span>}
              </div>
            ))}
          </div>

          {/* KAM assignment — open question #1 */}
          <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-md px-3 py-2">
            <div className="text-[12px]">
              <span className="text-gray-400">KAM</span>{' '}
              <span className="font-semibold text-gray-800">{client.kam || 'unassigned'}</span>
              {!!(client.assignments || []).length && (
                <span className="text-[10px] text-gray-400 block">
                  {(client.assignments || []).length} assignment{(client.assignments || []).length === 1 ? '' : 's'}{' '}on record
                </span>
              )}
            </div>
            {reassigning ? (
              <div className="flex items-center gap-1.5">
                <select value={nextKam} onChange={(e) => setNextKam(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white">
                  <option value="">Unassigned</option>
                  {[...new Set([...KAMS, ...(client.kam ? [client.kam] : [])])].sort().map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={reassign} className={btnPrimary}>Save</button>
                <button onClick={() => setReassigning(false)} className="text-[11px] text-gray-400 cursor-pointer">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setReassigning(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Reassign</button>
            )}
          </div>
          {error && <p className="text-[11px] text-red-600">Could not save: {error}</p>}

          {/* §3.3 upcoming project */}
          <div className="border border-gray-200 rounded-md px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Upcoming project · §3.3</div>
            {upcoming
              ? <p className="text-[12px] text-gray-700">{upcoming.text} <span className="text-[10px] text-gray-400">· noted {upcoming.at}</span></p>
              : <p className="text-[12px] text-gray-300">Nothing on file. It is captured on an interaction.</p>}
          </div>

          {/* §3.2 mismatch — reported, never overridden */}
          {mismatch && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              <span className="font-semibold">Temperature vs. the record:</span> {mismatch.message}{' '}
              <span className="text-amber-700">It stays your call — nothing is changed for you (PRD open question #5).</span>
            </p>
          )}

          {/* §3.1 interaction log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Latest interaction · §3.1 · {log.length}</span>
              <button onClick={onLogInteraction} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">+ Log call / meeting</button>
            </div>
            {!log.length ? (
              <p className="text-[12px] text-gray-300 py-3 text-center border border-dashed border-gray-200 rounded-md">
                Nothing logged against this account yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {log.map((i) => (
                  <div key={i.id} className="border border-gray-100 rounded-md p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-gray-700">
                        {i.type} · {i.date}
                        {i.loggedBy && <span className="text-gray-400 font-normal"> · {i.loggedBy}</span>}
                      </span>
                      <TemperatureChip value={i.temperature} />
                    </div>
                    {i.summary && <p className="text-[12px] text-gray-600 mt-1 break-words">{i.summary}</p>}
                    {i.upcomingProject && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        <span className="text-gray-400">Upcoming:</span> {i.upcomingProject}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {i.nextFollowUpDate ? `Next follow-up ${i.nextFollowUpDate}` : 'No next follow-up set'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* §5 orders on this client */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active orders · §5 · {orders.length}</span>
              <button onClick={onAddOrder} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">+ Add order</button>
            </div>
            {!orders.length ? (
              <p className="text-[12px] text-gray-300">No KAM-created order against this client.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orders.map((o) => (
                  <button key={o.id} onClick={() => onOpenOrder(o)} className="text-left border border-gray-100 rounded-md p-2 hover:border-[#0F766E] cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] text-gray-700 min-w-0 break-words">{o.requirement || <span className="text-gray-300">no requirement details</span>}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                        style={{ background: KAM_ORDER_STATUS_COLORS[o.status] + '18', color: KAM_ORDER_STATUS_COLORS[o.status] }}>
                        {o.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {o.enqId ? <span className="font-mono">{o.enqId}</span> : 'no Enq ID'}
                      {o.orderValue !== undefined ? ` · ${fmtINR(o.orderValue)} from Procurement` : o.estimatedValue ? ` · ${fmtINR(o.estimatedValue)} estimated` : ''}
                      {o.expectedClosure && ` · closes ${o.expectedClosure}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <EscalationSection
            client={client}
            today={today}
            onSave={(escalations) => onSaveClient({ ...client, escalations })}
          />
        </div>
      </div>
    </div>
  );
}

// ── §5 Active Order form ──────────────────────────────────────────────────────

function OrderModal({ order, isNew, clients, kam, onClose, onSave }: {
  order: KamOrder;
  isNew?: boolean;
  clients: ClientEntity[];
  kam: string;
  onClose: () => void;
  onSave: (o: KamOrder) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<KamOrder>(order);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'matched' | 'no-match' | 'unavailable'; note?: string; available?: string[] }>({ state: 'idle' });

  const set = <K extends keyof KamOrder>(k: K, v: KamOrder[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = kamOrderGateErrors(draft);
  const prompts = kamOrderStatusPrompts(draft);

  const pickClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const primary = primaryContact(c.contacts);
    setDraft((d) => ({
      ...d,
      clientId: c.id,
      company: c.company,
      contactName: primary?.name,
      phone: primary?.number,
      source: c.source,
      // The order follows the account's KAM, so a reassignment does not leave
      // orders behind on the previous owner's board.
      kam: c.kam || d.kam,
    }));
  };

  // §5.1 "Order Value (Procurement) — auto-fetched, in line with the Enquiry ID".
  const runLookup = async () => {
    const enq = String(draft.enqId || '').trim();
    if (!enq || !draft.phone) {
      setLookup({ state: 'no-match', note: 'An Enquiry ID and a contact number are both needed to look one up.' });
      return;
    }
    setLookup({ state: 'busy' });
    const r = await lookupEnqId(draft.phone, enq);
    if (r.status === 'matched') {
      setDraft((d) => ({
        ...d,
        orderValue: r.orderValue,
        orderValueSource: 'deal',
        dealStatus: r.dealStatus,
        value: Number(r.orderValue) || 0,
      }));
      setLookup({ state: 'matched', note: `${fmtINR(r.orderValue || 0)} · ${r.dealStatus || 'no status'}${r.bmName ? ` · ${r.bmName}` : ''}` });
    } else if (r.status === 'unavailable') {
      setLookup({ state: 'unavailable', note: 'Procurement could not be reached. That is not evidence the Enquiry ID is wrong — try again.' });
    } else {
      setLookup({ state: 'no-match', available: r.available });
    }
  };

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setError('');
    const statusChanged = draft.status !== order.status;
    const err = await onSave({
      ...draft,
      // Realised rupees only. Never the estimate — this is the column analytics
      // sums as revenue.
      value: Number(draft.orderValue) || 0,
      statusChangedAt: statusChanged || isNew ? new Date().toISOString() : draft.statusChangedAt,
      createdAt: draft.createdAt || new Date().toISOString(),
      kam: draft.kam || kam,
    });
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[580px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">{isNew ? 'Add Order' : draft.company}</h2>
            <p className="text-[11px] text-gray-400">KAM PRD §5.1</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Company name" hint="Your assigned clients only — §5.1. Add the client in the Client Database first if it is not here.">
            {isNew ? (
              <select value={draft.clientId || ''} onChange={(e) => pickClient(e.target.value)} className={inputCls}>
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company}{c.kam ? ` · ${c.kam}` : ''}</option>)}
              </select>
            ) : (
              <div className="text-[13px] font-semibold text-gray-800">
                {draft.company}
                <span className="text-[11px] text-gray-400 font-normal"> · {draft.phone || 'no number'}</span>
              </div>
            )}
          </Field>

          {!isNew && !draft.clientId && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              This order pre-dates the Client Database and is not linked to a client entity, so it does not appear in
              that client&apos;s Active Orders list. Add the client to the Client Database with this number
              ({draft.phone || 'none on file'}) and the link forms on the next seed.
            </p>
          )}

          <Field label="Requirement details">
            <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="What the client needs" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Order value (your estimate)" hint="Never reported as revenue — §5.1.">
              <input type="number" min={0} value={draft.estimatedValue ?? ''} onChange={(e) => set('estimatedValue', Number(e.target.value) || undefined)} className={inputCls} />
            </Field>
            <Field label="Expected date of closure">
              <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value || undefined)} className={inputCls} />
            </Field>
          </div>

          <Field label="Status" hint={KAM_ORDER_STATUS_HINT[draft.status]}>
            <select value={draft.status} onChange={(e) => set('status', e.target.value as KamOrderStatus)} className={inputCls}>
              {KAM_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {draft.legacyStage && (
            <p className="text-[10px] text-gray-400">
              Stored on this row as “{draft.legacyStage}” by the old board; shown as {draft.status}. Saving rewrites it.
            </p>
          )}

          <Field label={`Enquiry ID${draft.status === 'PI Shared' ? ' *' : ''}`} hint="§5.2 requires this at PI Shared, and it is what fetches the order value.">
            <div className="flex gap-1.5">
              <input value={draft.enqId || ''} onChange={(e) => { set('enqId', e.target.value); setLookup({ state: 'idle' }); }} className={inputCls + ' font-mono'} placeholder="ENQ2026…" />
              <button onClick={runLookup} disabled={lookup.state === 'busy'} className={btnGhost + ' whitespace-nowrap'}>
                {lookup.state === 'busy' ? 'Looking…' : 'Fetch value'}
              </button>
            </div>
          </Field>

          {lookup.state === 'matched' && <p className="text-[11px] text-[#0F766E]">Matched · {lookup.note}</p>}
          {lookup.state === 'unavailable' && <p className="text-[11px] text-blue-700">{lookup.note}</p>}
          {lookup.state === 'no-match' && (
            <p className="text-[11px] text-amber-800">
              {lookup.note || `No deal ticket on ${draft.phone} has that exact Enquiry ID.`}
              {!!lookup.available?.length && <> Enquiry IDs on this number: <span className="font-mono">{lookup.available.slice(0, 6).join(', ')}</span>.</>}
              {' '}Matching is exact on purpose — resolving a near-miss would attach another client&apos;s money to this order.
            </p>
          )}

          <Field label="Order value (Procurement)" hint="Read from the deal ticket. The only figure counted as revenue.">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-bold text-gray-800">
                {draft.orderValue !== undefined ? fmtINR(draft.orderValue) : <span className="text-gray-300 font-normal text-[12px]">not fetched</span>}
              </span>
              {draft.orderValueSource && <span className="text-[10px] text-gray-400">from {draft.orderValueSource === 'deal' ? 'the deal ticket' : 'a manual entry'}</span>}
              {draft.dealStatus && <span className="text-[10px] text-gray-400">· {draft.dealStatus}</span>}
              {draft.orderValue !== undefined && (
                <button onClick={() => setDraft((d) => ({ ...d, orderValue: undefined, orderValueSource: undefined, dealStatus: undefined, value: 0 }))}
                  className="text-[10px] font-semibold text-gray-400 hover:underline cursor-pointer">clear</button>
              )}
            </div>
          </Field>

          {draft.status === 'Lost' && (
            <Field label="Lost reason *">
              <LostReasonSelect
                value={draft.lostReason || ''}
                options={KAM_ORDER_LOST_REASONS}
                onChange={(v) => set('lostReason', v || undefined)}
                className={inputCls}
              />
            </Field>
          )}

          {!!errors.length && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {!errors.length && !!prompts.length && (
            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
              {prompts.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length} className={btnPrimary}>
            {saving ? 'Saving…' : isNew ? 'Add order' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Active Orders bulk upload (the ops team's existing sheet) ─────────────────

function UploadModal({ existing, onClose, onImport }: {
  existing: KamOrder[];
  onClose: () => void;
  onImport: (orders: KamOrder[]) => Promise<Record<string, string>>;
}) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string> | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(''); setSaveErrors(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        setFileRows(parseDelimited(await file.text()));
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('the first sheet is empty');
        setFileRows(XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: true, raw: false, defval: '' }));
      }
      setFileName(file.name); setText('');
    } catch (e) {
      setFileRows(null); setFileName('');
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
    return parsed.rows.map((r) => (r.order && saveErrors[r.order.id] ? { ...r, saveError: saveErrors[r.order.id] } : r));
  }, [parsed.rows, saveErrors]);

  const summary = useMemo(() => summarize(rowsWithSave, parsed.skipped), [rowsWithSave, parsed.skipped]);
  const importable = rowsWithSave.filter((r) => r.order && !r.saveError);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Upload Active Orders</h2>
            <p className="text-[11px] text-gray-400">The ops team&apos;s existing sheet · one row = one order</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="text-[12px] text-gray-500">
            <p className="mb-1">Columns in this order (only <span className="font-semibold">Client Name</span> required):</p>
            <div className="text-[11px] text-gray-600 bg-gray-50 rounded-md p-2 overflow-x-auto whitespace-nowrap">
              {UPLOAD_COLUMNS.map((c, i) => (
                <span key={c}><span className="text-gray-400">{i + 1}.</span> {c}{i < UPLOAD_COLUMNS.length - 1 ? <span className="text-gray-300">{'  ·  '}</span> : ''}</span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              The “Value” column is read as the KAM&apos;s <span className="font-semibold">estimate</span>, not as revenue —
              revenue comes from the deal ticket the Enquiry ID matches. The old board&apos;s status names
              (Order Placed, Awaiting Payment…) are still accepted and mapped to the PRD&apos;s five.
              Clients are <span className="font-semibold">not</span> created by this upload; use the Client Database for that.
            </p>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold" />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {parsed.rows.length} data rows</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows</span>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); setFileError(''); setSaveErrors(null); }}
              rows={3} className={inputCls + ' resize-none font-mono text-[11px]'}
              placeholder={'Metro Constructions, Rahul Nair, 9900099013, ENQ-3980, 265000, 2026-08-01, PI Shared, Jadhav, Sample shared'} />
          </label>

          {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}

          {!!rowsWithSave.length && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                <div className="flex gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{summary.valid - summary.failed} ready</span>
                  {!!summary.updates && <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold">{summary.updates} updates</span>}
                  {!!summary.warnings && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{summary.warnings} warnings</span>}
                  {!!summary.errors && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.errors} rejected</span>}
                  {!!summary.failed && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.failed} failed to save</span>}
                </div>
                <button onClick={() => exportRowsCsv(IMPORT_LOG_HEADERS, importLogRows(rowsWithSave), `kam-order-import-log-${todayStr()}`)}
                  className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Download log (.csv)</button>
              </div>
              {rowsWithSave.some((r) => r.issues.length || r.saveError) && (
                <div className="border border-gray-200 rounded-md overflow-hidden max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {rowsWithSave.filter((r) => r.issues.length || r.saveError).map((r) => (
                        <tr key={r.line} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 font-mono text-gray-400 w-10">{r.line}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-700">{r.company || <span className="text-gray-300">(blank)</span>}</td>
                          <td className="px-2 py-1.5">
                            {r.saveError && <div className="text-red-600">Could not save: {r.saveError}</div>}
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
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>{saveErrors ? 'Close' : 'Cancel'}</button>
          <button
            onClick={async () => {
              if (!importable.length) return;
              setSaving(true);
              try {
                const errors = await onImport(importable.map((r) => r.order!));
                if (Object.keys(errors).length) setSaveErrors(errors); else onClose();
              } finally { setSaving(false); }
            }}
            disabled={saving || !importable.length}
            className={btnPrimary}
          >
            {saving ? 'Importing…' : importable.length ? `Import ${importable.length} order${importable.length === 1 ? '' : 's'}` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cadence lists (§4.2 / §4.3) ───────────────────────────────────────────────

function CadenceList({ rows, kind, onOpen, emptyNote }: {
  rows: CadenceRow[];
  kind: 'today' | 'queue';
  onOpen: (clientId: string) => void;
  emptyNote: string;
}) {
  if (!rows.length) return <p className="text-[12px] text-gray-400 py-8 text-center">{emptyNote}</p>;
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
              <th className="text-left font-semibold px-3 py-2">Company</th>
              <th className="text-left font-semibold px-3 py-2">Contact</th>
              <th className="text-left font-semibold px-3 py-2">Follow-up due</th>
              {kind === 'queue' && <th className="text-left font-semibold px-3 py-2">Overdue by</th>}
              <th className="text-left font-semibold px-3 py-2">Last logged</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const primary = primaryContact(r.client.contacts);
              const band = queueAgeBand(r.agedDays);
              return (
                <tr key={r.client.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-gray-800">{r.client.company}</span>
                    <div className="text-[10px] text-gray-400">{r.client.kam || 'unassigned'}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    <span className="font-mono">{primary?.number || '—'}</span>
                    {contactLabel(primary) && <span className="text-gray-400"> · {contactLabel(primary)}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.date}</td>
                  {kind === 'queue' && (
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: band.color + '18', color: band.color }}>
                        {r.agedDays}d
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-gray-500">
                    {r.from.type} {r.from.date}
                    {r.from.summary && <span className="text-gray-400"> · {r.from.summary.slice(0, 48)}{r.from.summary.length > 48 ? '…' : ''}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onOpen(r.client.id)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">
                      Open
                    </button>
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

// ── The tab ───────────────────────────────────────────────────────────────────

export default function KAMs() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [orders, setOrders] = useState<KamOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<{ byPhone: Record<string, { last?: string; loaded: boolean }> } | null>(null);
  const [capped, setCapped] = useState(0);
  const [sync, setSync] = useState<{
    matched: number; noMatch: number; unavailable: number; overflow: number;
    advanced: number; writeErrors: string[];
  } | null>(null);

  const [view, setView] = useState<KamView>('clients');
  const [kamFilter, setKamFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | KamOrderStatus>('all');

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [loggingFor, setLoggingFor] = useState<string | null>(null);
  const [orderModal, setOrderModal] = useState<{ order: KamOrder; isNew: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const today = istToday();
  const boardScroll = useDragAutoScroll<HTMLDivElement>();

  const load = useCallback(async () => {
    setLoading(true);
    const bad: string[] = [];
    const [cl, ord] = await Promise.all([
      fetchClients().catch((e) => { console.error('[b2b] clients failed', e); bad.push('the client master'); return [] as ClientEntity[]; }),
      fetchKamOrders().catch((e) => { console.error('[b2b] kam orders failed', e); bad.push('the order list'); return [] as KamOrder[]; }),
    ]);
    setClients(cl);
    setOrders(ord);
    setFailed(bad);

    const phones = cl.flatMap((c) => contactNumbers(c.contacts));
    const agg = await fetchClientOrderHistories(phones);
    setAggregates(agg);
    const head = phones.slice(0, ORDER_DETAIL_PHONE_CAP);
    setCapped(Math.max(0, phones.length - head.length));
    const details = await fetchClientOrderRows(head);
    setDates(orderDatesFromRows(details, head));
    setLoading(false);

    // ── §5.1: pull the Procurement value for every order with an Enquiry ID,
    //    then let the deal ticket advance the status (see kamAutoStage.ts).
    //
    // Runs after the board has painted, so a slow Django never holds the list
    // up, and every write's failure is collected rather than dropped — a
    // fire-and-forget upsert here is how one live row ended up with the same
    // auto-advance note twice.
    if (!ord.length) return;
    const { resolutions, overflow } = await resolveKamOrders(ord);
    const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
    const afterResolve = ord.map((o) => resolvedById.get(o.id) ?? o);

    const advances = planAdvances(afterResolve);
    const advanced = advances.map(applyAdvance);
    const advancedById = new Map(advanced.map((o) => [o.id, o]));
    const finalOrders = afterResolve.map((o) => advancedById.get(o.id) ?? o);

    // Persist only the rows that actually changed, and await each one.
    const changed = finalOrders.filter((o) => {
      const before = ord.find((x) => x.id === o.id);
      return before && (before.status !== o.status || before.orderValue !== o.orderValue || before.dealStatus !== o.dealStatus);
    });
    const writeErrors: string[] = [];
    for (const o of changed) {
      const err = await upsertKamOrder(o);
      if (err) writeErrors.push(`${o.company}: ${err}`);
    }

    setOrders(finalOrders);
    setSync({
      matched: resolutions.filter((r) => r.outcome === 'matched').length,
      noMatch: resolutions.filter((r) => r.outcome === 'no-match').length,
      unavailable: resolutions.filter((r) => r.outcome === 'unavailable').length,
      overflow,
      advanced: advances.length,
      writeErrors,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const metricsFor = useCallback(
    (c: ClientEntity): ClientOrderMetrics => clientMetricsFrom(c.contacts, aggregates, dates || undefined),
    [aggregates, dates],
  );

  const kamOptions = useMemo(() => {
    const seen = new Set<string>(KAMS);
    clients.forEach((c) => c.kam && seen.add(c.kam));
    orders.forEach((o) => o.kam && seen.add(o.kam));
    return [...seen].sort();
  }, [clients, orders]);

  /** §2 is "every client assigned to the logged-in KAM" — the filter IS that scope. */
  const scopedClients = useMemo(
    () => (kamFilter === 'all' ? clients : clients.filter((c) => (c.kam || '') === (kamFilter === 'unassigned' ? '' : kamFilter))),
    [clients, kamFilter],
  );
  const scopedOrders = useMemo(
    () => (kamFilter === 'all' ? orders : orders.filter((o) => o.kam === kamFilter)),
    [orders, kamFilter],
  );
  // Unscoped, for the empty-state banner only: it counts every order, while the
  // Active Orders chip counts the open ones. Naming both numbers is what stops
  // "30 orders exist" reading as a contradiction of a chip that says 4.
  const openOrderCount = useMemo(
    () => orders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length,
    [orders],
  );

  const rows = useMemo(() => assignedClientRows(scopedClients, metricsFor, today), [scopedClients, metricsFor, today]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return rows
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (!q) return true;
        return r.company.toLowerCase().includes(q)
          || r.contactPerson.toLowerCase().includes(q)
          || (digits.length >= 4 && contactNumbers(r.client.contacts).some((p) => p.includes(digits)));
      })
      .sort((a, b) => {
        // Overdue first, then due today, then by how long it has been quiet.
        const rank = (x: AssignedClientRow) => (x.followUp === 'overdue' ? 0 : x.followUp === 'today' ? 1 : 2);
        return rank(a) - rank(b) || (b.daysSinceContact ?? -1) - (a.daysSinceContact ?? -1) || a.company.localeCompare(b.company);
      });
  }, [rows, search, statusFilter]);

  const today_ = useMemo(() => todaysCalls(scopedClients, today), [scopedClients, today]);
  const queue = useMemo(() => followUpQueue(scopedClients, today), [scopedClients, today]);
  const pipeline = useMemo(() => kamPipeline(scopedOrders), [scopedOrders]);

  const callsToday = useMemo(() => {
    if (kamFilter === 'all') {
      const kams = [...new Set(clients.map((c) => c.kam).filter((k): k is string => !!k))];
      return kams.reduce((t, k) => t + callsLoggedOn(clients, k, today), 0);
    }
    return callsLoggedOn(clients, kamFilter, today);
  }, [clients, kamFilter, today]);
  const callTarget = kamFilter === 'all'
    ? [...new Set(clients.map((c) => c.kam).filter(Boolean))].length * DAILY_CALL_TARGET
    : DAILY_CALL_TARGET;

  const legacyCount = useMemo(() => orders.filter((o) => isLegacyKamStage(o.legacyStage)).length, [orders]);
  const unlinkedOrders = useMemo(() => orders.filter((o) => !o.clientId).length, [orders]);

  const drawerRow = useMemo(() => rows.find((r) => r.client.id === drawerId) || null, [rows, drawerId]);
  const loggingClient = useMemo(() => clients.find((c) => c.id === loggingFor) || null, [clients, loggingFor]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    return null;
  };

  const saveOrder = async (o: KamOrder): Promise<string | null> => {
    const err = await upsertKamOrder(o);
    if (err) return err;
    setOrders((prev) => (prev.some((x) => x.id === o.id) ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev]));
    return null;
  };

  const blankOrder = (client?: ClientEntity): KamOrder => {
    const primary = client ? primaryContact(client.contacts) : undefined;
    return {
      id: `KAM-${Date.now()}`,
      clientId: client?.id,
      company: client?.company || '',
      contactName: primary?.name,
      phone: primary?.number,
      status: 'Requirement Logged',
      kam: client?.kam || (kamFilter !== 'all' && kamFilter !== 'unassigned' ? kamFilter : KAMS[0]),
      source: client?.source || 'Existing',
      value: 0,
      notes: [],
      createdAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
    };
  };

  const exportClients = (format: ExportFormat) => {
    const headers = ['Company', 'Source', 'Contact Person', 'Contact Number', 'Last Order Placed', 'Average Order Value',
      'Number of Orders', 'Total Revenue Generated', 'Client Status', 'Segment', 'Temperature', 'Upcoming Project',
      'Next Follow-up', 'Days Since Contact', 'KAM'];
    const body = filteredRows.map((r) => [
      r.company, r.source, r.contactPerson, r.contactNumber,
      r.metrics.lastOrderPlaced || (r.metrics.dateState === 'unavailable' ? 'unread' : ''),
      r.metrics.averageOrderValue !== undefined ? Math.round(r.metrics.averageOrderValue) : '',
      r.metrics.orders ?? '', r.metrics.totalRevenue ?? '', r.status, r.segment || '',
      r.temperature ?? '', r.upcomingProject || '', r.nextFollowUpDate || '', r.daysSinceContact ?? '', r.client.kam || '',
    ]);
    setExporting(true);
    try {
      if (format === 'csv') exportRowsCsv(headers, body, `kam-clients-${todayStr()}`);
      else exportRowsExcel(headers, body, `kam-clients-${todayStr()}`, 'Assigned Clients');
    } finally { setExporting(false); }
  };

  const currentView = KAM_VIEWS.find((v) => v.key === view)!;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">KAM</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Key Account Management · clients handed off once their first order closed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton onExport={(f) => exportClients(f)} disabled={exporting} />
          <button onClick={() => setUploading(true)} className={btnGhost}>Upload Orders</button>
          <button onClick={() => setOrderModal({ order: blankOrder(), isNew: true })} className={btnPrimary} disabled={!clients.length}>+ Add Order</button>
        </div>
      </div>

      {!!failed.length && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Partly loaded.</span> {failed.join(' and ')}{' '}could not be read, so the{' '}
          numbers below are incomplete. <button onClick={load} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {!failed.length && !clients.length && !loading && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-900">
          <span className="font-semibold">No clients are assigned yet.</span> §7 says this module shares its client
          universe with the Client Database — seed that tab and assigned clients, the call cadence and the temperature
          readings all appear here.
          {!!orders.length && ` ${orders.length} order${orders.length === 1 ? '' : 's'} already exist and are on the Active Orders view — ${openOrderCount} still open, which is the number that view's own chip counts.`}
        </div>
      )}

      {/* ── Scope + view switcher ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">KAM</span>
        <select value={kamFilter} onChange={(e) => setKamFilter(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All KAMs ({clients.length} clients)</option>
          <option value="unassigned">Unassigned</option>
          {kamOptions.map((k) => <option key={k} value={k}>{k} ({clients.filter((c) => c.kam === k).length})</option>)}
        </select>
        {kamFilter !== 'all' && (
          <span className="text-[11px] text-gray-500">
            Calls today <span className="font-mono font-bold" style={{ color: callsToday >= callTarget ? '#15803D' : '#B45309' }}>{callsToday}</span>
            <span className="text-gray-400">/{callTarget}</span>
          </span>
        )}
        <div className="flex gap-1 ml-auto flex-wrap">
          {KAM_VIEWS.filter((v) => v.key !== 'dashboard').map((v) => {
            const count = v.key === 'clients' ? filteredRows.length
              : v.key === 'today' ? today_.length
              : v.key === 'queue' ? queue.length
              : scopedOrders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length;
            return (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-2.5 py-1.5 text-[12px] font-semibold rounded-md border cursor-pointer whitespace-nowrap ${view === v.key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200'}`}
                title={v.note}>
                {v.label}
                <span className={`ml-1.5 font-mono ${view === v.key ? 'text-gray-300' : 'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mb-3">
        <span className="font-semibold text-gray-500">{currentView.section}</span> · {currentView.note}
      </p>

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
        <StatTile label="Assigned clients" value={rows.length} sub={`${rows.filter((r) => r.status === 'Active').length} active`} />
        <StatTile label="Calls today" value={`${callsToday}/${callTarget}`} tone={callsToday >= callTarget ? '#15803D' : '#B45309'} sub="§4.1 target, reported not enforced" />
        <StatTile label="Due today" value={today_.length} tone={today_.length ? '#EA580C' : undefined} />
        <StatTile label="Overdue" value={queue.length} tone={queue.length ? '#DC2626' : undefined} />
        <StatTile label="Pipeline" value={fmtL(pipeline.pipeline)} sub={pipeline.estimatedPipeline ? `${fmtL(pipeline.estimatedPipeline)} estimated` : `${pipeline.count} open`} />
        <StatTile label="Open orders" value={scopedOrders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length} />
      </div>

      {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>}

      {/* ── §2 Assigned Clients ── */}
      {!loading && view === 'clients' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact or number…"
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] w-full sm:w-[260px]" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ClientStatus)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
              <option value="all">All statuses</option>
              {(['Active', 'Inactive', 'Unknown'] as ClientStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {!!capped && (
              <span className="text-[10px] text-blue-600" title={`Beyond the ${ORDER_DETAIL_PHONE_CAP}-number cap`}>
                {capped}{' '}number(s) not date-checked → Unknown
              </span>
            )}
          </div>

          {!filteredRows.length ? (
            <p className="text-[12px] text-gray-400 py-8 text-center">
              {clients.length ? 'No client matches these filters.' : 'No assigned clients.'}
            </p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[1040px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                      <th className="text-left font-semibold px-3 py-2">Company</th>
                      <th className="text-left font-semibold px-3 py-2">Source</th>
                      <th className="text-left font-semibold px-3 py-2">Contact</th>
                      <th className="text-left font-semibold px-3 py-2">Last order</th>
                      <th className="text-right font-semibold px-3 py-2">Orders</th>
                      <th className="text-right font-semibold px-3 py-2">Avg order</th>
                      <th className="text-right font-semibold px-3 py-2">Total revenue</th>
                      <th className="text-left font-semibold px-3 py-2">Status</th>
                      <th className="text-left font-semibold px-3 py-2">Temp</th>
                      <th className="text-left font-semibold px-3 py-2">Next follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.client.id} onClick={() => setDrawerId(r.client.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-gray-800">{r.company}</div>
                          <div className="text-[10px] text-gray-400">
                            {r.client.kam || 'unassigned'}
                            {r.segment && ` · Segment ${r.segment}`}
                            {r.upcomingProject && <span className="text-[#0F766E]"> · project noted</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.source}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          <span className="font-mono">{r.contactNumber || '—'}</span>
                          {r.contactPerson && <div className="text-[10px] text-gray-400">{r.contactPerson}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap"><Metric value={r.metrics.lastOrderPlaced} state={r.metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700"><Metric value={r.metrics.orders} state={r.metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600 whitespace-nowrap"><Metric value={r.metrics.averageOrderValue} state={r.metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap"><Metric value={r.metrics.totalRevenue} state={r.metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-2"><TemperatureChip value={r.temperature} previous={r.previousTemperature} at={r.temperatureAt} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.nextFollowUpDate ? (
                            <span className="font-mono" style={{ color: r.followUp === 'overdue' ? '#DC2626' : r.followUp === 'today' ? '#EA580C' : '#4B5563' }}>
                              {r.nextFollowUpDate}
                            </span>
                          ) : <span className="text-gray-300">none set</span>}
                          {r.daysSinceContact !== undefined && <div className="text-[10px] text-gray-400">{r.daysSinceContact}d since contact</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── §4.2 Today's Calls ── */}
      {!loading && view === 'today' && (
        <CadenceList rows={today_} kind="today" onOpen={setDrawerId}
          emptyNote="Nothing is due today. A client appears here when the follow-up date on its latest interaction is today." />
      )}

      {/* ── §4.3 Follow-up Queue ── */}
      {!loading && view === 'queue' && (
        <>
          <CadenceList rows={queue} kind="queue" onOpen={setDrawerId}
            emptyNote="Nothing overdue. A row leaves this queue the moment you log the call — nothing has to be ticked off." />
          {!!queue.length && (
            <p className="text-[10px] text-gray-400 mt-2">
              FIFO — oldest follow-up first. There is no floor on how far back the queue reaches (PRD open question #3);
              the age badge is there so a queue full of month-old rows is visible rather than quietly trimmed.
            </p>
          )}
        </>
      )}

      {/* ── §5.3 Active Orders ── */}
      {!loading && view === 'orders' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value as 'all' | KamOrderStatus)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
              <option value="all">All statuses</option>
              {KAM_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {!!legacyCount && (
              <span className="text-[10px] text-gray-500" title="Stored under the old board's stage names; mapped on read, rewritten on save">
                {legacyCount} row{legacyCount === 1 ? '' : 's'}{' '}carry the old board&apos;s status wording
              </span>
            )}
            {!!unlinkedOrders && (
              <span className="text-[10px] text-amber-700" title="No client entity holds this order's phone number">
                {unlinkedOrders}{' '}not linked to a client entity
              </span>
            )}
          </div>

          {/* What the Procurement sync actually did, in full. Three outcomes stay
              three: an Enquiry ID that matched nothing is NOT the same as a
              Django outage, and neither is silently rendered as ₹0. */}
          {sync && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
              <span className="font-semibold text-gray-700">Procurement sync:</span>{' '}
              <span className="text-[#0F766E] font-semibold">{sync.matched}</span> order value{sync.matched === 1 ? '' : 's'}{' '}fetched
              {!!sync.advanced && <> · <span className="text-[#0F766E] font-semibold">{sync.advanced}</span> status{sync.advanced === 1 ? '' : 'es'} advanced off the deal ticket</>}
              {!!sync.noMatch && <> · <span className="text-amber-700 font-semibold">{sync.noMatch}</span> Enquiry ID{sync.noMatch === 1 ? '' : 's'} matched no ticket on the client&apos;s number</>}
              {!!sync.unavailable && <> · <span className="text-blue-600 font-semibold">{sync.unavailable}</span> could not be reached (not the same as invalid)</>}
              {!!sync.overflow && <> · <span className="text-gray-500 font-semibold">{sync.overflow}</span> beyond the {ENQ_RESOLVE_CAP}-order cap, not attempted</>}
              {!sync.matched && !sync.advanced && !sync.noMatch && !sync.unavailable && !sync.overflow && ' nothing needed fetching.'}
              {!!sync.writeErrors.length && (
                <div className="text-red-600 mt-1">
                  {sync.writeErrors.length} update{sync.writeErrors.length === 1 ? '' : 's'}{' '}could not be saved, so the{' '}
                  board is ahead of the database until you reload: {sync.writeErrors.slice(0, 3).join('; ')}
                </div>
              )}
              <div className="text-[10px] text-gray-400 mt-0.5">
                An order with no Enquiry ID is never advanced — it is matched to its own ticket by an exact Enquiry ID,
                never off another order on the same client.
              </div>
            </div>
          )}

          <div ref={boardScroll.ref} className="flex gap-3 overflow-x-auto pb-3"
            onDragOver={boardScroll.onDragOver} onDragEnd={boardScroll.onDragEnd} onDrop={boardScroll.onDrop}>
            {(orderStatusFilter === 'all' ? KAM_ORDER_STATUSES : [orderStatusFilter]).map((s) => {
              const items = scopedOrders.filter((o) => o.status === s);
              const dealMoney = items.reduce((t, o) => t + (Number(o.orderValue) || 0), 0);
              const estimate = items.reduce((t, o) => t + (Number(o.estimatedValue) || 0), 0);
              return (
                <div key={s} className="w-[230px] shrink-0">
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="h-1" style={{ background: KAM_ORDER_STATUS_COLORS[s] }} />
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500" title={KAM_ORDER_STATUS_HINT[s]}>{s}</span>
                        <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {dealMoney ? <span className="font-mono text-gray-600">{fmtL(dealMoney)}</span> : <span>no ticket value</span>}
                        {!!estimate && <span> · {fmtL(estimate)} est.</span>}
                      </div>
                    </div>
                    <div className="p-2 flex flex-col gap-2 min-h-[80px]">
                      {!items.length ? (
                        <div className="text-[11px] text-gray-300 text-center py-4">No orders</div>
                      ) : items.map((o) => (
                        <button key={o.id} onClick={() => setOrderModal({ order: o, isNew: false })}
                          className="text-left bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer">
                          <div className="text-[12px] font-semibold text-gray-800 leading-tight">{o.company}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{o.kam}{o.enqId ? ` · ${o.enqId}` : ''}</div>
                          {o.requirement && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{o.requirement}</div>}
                          <div className="flex items-baseline justify-between mt-2">
                            <span className="text-[11px] font-mono font-semibold text-gray-700">
                              {o.orderValue !== undefined ? fmtL(o.orderValue) : <span className="text-gray-400 font-normal">no ticket</span>}
                            </span>
                            {o.estimatedValue !== undefined && (
                              <span className="text-[10px] text-gray-400" title="The KAM's estimate — never counted as revenue">{fmtL(o.estimatedValue)} est.</span>
                            )}
                          </div>
                          {o.expectedClosure && <div className="text-[10px] text-gray-400 mt-1">closes {o.expectedClosure}</div>}
                          {o.status === 'Lost' && (
                            <div className="text-[10px] text-red-600 mt-1">{o.lostReason || 'no reason recorded'}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-gray-400 mt-2">
            The bold figure on a card is the deal ticket&apos;s order value — the only figure counted as revenue. “est.” is
            the KAM&apos;s own estimate from §5.1 and is never summed into it. A card with “no ticket” at Closed means the
            Enquiry ID has not resolved yet, so that order contributes ₹0 to revenue until it does.
          </p>
        </>
      )}

      {/* ── Modals / drawer ── */}
      {drawerRow && (
        <ClientDrawer
          row={drawerRow}
          orders={orders.filter((o) => o.clientId === drawerRow.client.id)}
          today={today}
          onClose={() => setDrawerId(null)}
          onLogInteraction={() => setLoggingFor(drawerRow.client.id)}
          onSaveClient={saveClient}
          onOpenOrder={(o) => setOrderModal({ order: o, isNew: false })}
          onAddOrder={() => setOrderModal({ order: blankOrder(drawerRow.client), isNew: true })}
        />
      )}

      {loggingClient && (
        <InteractionModal
          client={loggingClient}
          kam={loggingClient.kam || (kamFilter !== 'all' ? kamFilter : KAMS[0])}
          today={today}
          onClose={() => setLoggingFor(null)}
          onSave={(i) => saveClient({ ...loggingClient, interactions: [...(loggingClient.interactions || []), i] })}
        />
      )}

      {orderModal && (
        <OrderModal
          order={orderModal.order}
          isNew={orderModal.isNew}
          clients={kamFilter === 'all' ? clients : scopedClients}
          kam={kamFilter !== 'all' && kamFilter !== 'unassigned' ? kamFilter : KAMS[0]}
          onClose={() => setOrderModal(null)}
          onSave={saveOrder}
        />
      )}

      {uploading && (
        <UploadModal
          existing={orders}
          onClose={() => setUploading(false)}
          onImport={async (imported) => {
            // Awaited, so the modal reports which rows actually persisted rather
            // than claiming success on a fire-and-forget write.
            const errors: Record<string, string> = {};
            const saved: KamOrder[] = [];
            for (const o of imported) {
              const err = await upsertKamOrder(o);
              if (err) errors[o.id] = err; else saved.push(o);
            }
            if (saved.length) {
              const ids = new Set(saved.map((o) => o.id));
              setOrders((prev) => [...saved, ...prev.filter((o) => !ids.has(o.id))]);
            }
            return errors;
          }}
        />
      )}
    </div>
  );
}
