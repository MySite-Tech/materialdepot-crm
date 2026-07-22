'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  INBOUND_STAGES, INBOUND_STAGE_COLORS, PRIORITY_COLORS, KYLAS_LEAD_CATEGORIES, KAM_STAGES,
  fmtINR, type InboundLead, type InboundStage, type Priority,
  type LeadNote, type CallLogEntry,
} from './mockData';
import { fetchLeadNotes, createLeadNote, fetchLeadCallLogs, updateInboundLeadKylas, fetchInboundLeadDetail, B2B_INBOUND_OWNER_LIST, B2B_INBOUND_PAGE_SIZE } from '@/lib/mockApi';
import { fetchInboundBoard, upsertInboundLead } from '@/lib/b2bLeads';

function PriorityBadge({ p }: { p: Priority }) {
  const c = PRIORITY_COLORS[p];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c + '18', color: c }}>
      {p}
    </span>
  );
}

function StageBadge({ s }: { s: InboundStage }) {
  const c = INBOUND_STAGE_COLORS[s];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c + '18', color: c }}>
      {s}
    </span>
  );
}

function LeadCard({
  lead, onClick, onDragStart,
}: {
  lead: InboundLead;
  onClick: () => void;
  onDragStart: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="text-[13px] font-semibold text-gray-800 leading-tight">{lead.company}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{lead.accountType} · {lead.phone}</div>
      <div className="flex items-center justify-between mt-2">
        <PriorityBadge p={lead.priority} />
        {lead.overdueHours != null ? (
          <span className="text-[10px] text-red-500 font-medium">{lead.followUpNote} · {lead.overdueHours}h overdue</span>
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function LeadDrawer({
  lead, onClose, onSave,
}: {
  lead: InboundLead;
  onClose: () => void;
  onSave: (patch: Partial<InboundLead>) => void;
}) {
  const [draft, setDraft] = useState<InboundLead>(lead);
  const [noteText, setNoteText] = useState('');
  const [kylasNotes, setKylasNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setNotesLoading(true);
    fetchLeadNotes(lead.id, lead.ownerId)
      .then((n) => { if (alive) setKylasNotes(n); })
      .finally(() => { if (alive) setNotesLoading(false); });
    return () => { alive = false; };
  }, [lead.id, lead.ownerId]);

  useEffect(() => {
    let alive = true;
    setCallsLoading(true);
    fetchLeadCallLogs(lead.id)
      .then((c) => { if (alive) setCallLogs(c); })
      .finally(() => { if (alive) setCallsLoading(false); });
    return () => { alive = false; };
  }, [lead.id]);

  // Requirement / categories / closure are Kylas-owned — load them live on open.
  const [detailLoading, setDetailLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setDetailLoading(true);
    fetchInboundLeadDetail(lead.id)
      .then((d) => {
        if (!alive) return;
        setDraft((prev) => ({
          ...prev,
          requirement: d.requirement ?? prev.requirement,
          requirementBrief: d.requirementBrief || prev.requirementBrief,
          timeline: d.timeline || prev.timeline,
          categories: d.categories ?? prev.categories,
          expectedClosure: d.expectedClosure || prev.expectedClosure,
        }));
      })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [lead.id]);

  const set = <K extends keyof InboundLead>(k: K, v: InboundLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggleCategory = (c: string) => {
    const cur = draft.categories || [];
    set('categories', cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
  };

  const [savingNote, setSavingNote] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    await updateInboundLeadKylas(lead.id, {
      requirement: draft.requirement,
      expectedClosure: draft.expectedClosure,
      categories: draft.categories,
    });
    setSaving(false);
    onSave(draft);
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    const ok = await createLeadNote(lead.id, text);
    if (ok) {
      setNoteText('');
      setKylasNotes(await fetchLeadNotes(lead.id, lead.ownerId));
    }
    setSavingNote(false);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-[#FAFAFA] h-full overflow-y-auto shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 bg-white border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{draft.company}</h2>
            <div className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-1.5">
              {draft.phone} · {draft.accountType} · <StageBadge s={draft.stage} />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Brief + notes */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Pre-sales brief</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">Via Kylas</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Timeline">
                  <div className={readonlyCls}>{draft.timeline || '—'}</div>
                </Field>
                <Field label="Priority">
                  <div className={readonlyCls}>{draft.priority}</div>
                </Field>
              </div>
              <Field label="Requirement brief" className="mt-3">
                <div className={readonlyCls + ' whitespace-pre-wrap min-h-[38px]'}>{draft.requirementBrief || '—'}</div>
              </Field>
              <Field label="Owner" className="mt-3">
                <div className={readonlyCls}>{draft.owner}</div>
              </Field>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Meeting / call notes</span>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this call or meeting..."
                rows={3}
                className={inputCls + ' resize-none mt-2'}
              />
              <button onClick={addNote} disabled={savingNote || !noteText.trim()} className="mt-2 bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold w-full disabled:opacity-50">{savingNote ? 'Saving…' : '+ Add Note'}</button>
              <div className="mt-3 flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
                {(() => {
                  const all = [...(draft.notes || []).slice().reverse(), ...kylasNotes];
                  if (notesLoading) return (
                    <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-gray-400">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
                      Loading notes…
                    </div>
                  );
                  if (all.length === 0) return <p className="text-[11px] text-gray-300 text-center py-2">No notes yet — log what was discussed on each call or meeting.</p>;
                  return all.map((n, i) => (
                    <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
                      <div className="text-gray-700">{n.text}</div>
                      <div className="text-gray-400 mt-1">{n.author}{n.ts ? ` · ${n.ts}` : ''}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Call cadence */}
          {(callsLoading || callLogs.length > 0) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Call logs</span>
                {!callsLoading && <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{callLogs.length} calls · via Kylas</span>}
              </div>
              <div className="flex flex-col divide-y divide-gray-100 max-h-[280px] overflow-y-auto">
                {callsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-gray-400">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
                    Loading call logs…
                  </div>
                ) : callLogs.map((c) => {
                  const connected = /connect|complete|answer/i.test(c.status);
                  return (
                    <div key={c.id} className="flex items-center gap-3 py-2.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 ${connected ? 'bg-[#0F766E] text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {/inbound/i.test(c.direction) ? '↓' : '↑'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-800">
                          {c.status}
                          {c.durationSec ? <span className="text-gray-400 font-normal"> · {Math.floor(c.durationSec / 60)}m {c.durationSec % 60}s</span> : null}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {c.direction}{c.ts ? ` · ${c.ts}` : ''}{c.by ? ` · ${c.by}` : ''}
                        </div>
                        {c.note && <div className="text-[11px] text-gray-500 mt-0.5">{c.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Requirement details */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Requirement details</span>
              {detailLoading && <span className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />}
            </div>
            <Field label="Category" className="mt-3">
              <div className="flex flex-wrap gap-2">
                {KYLAS_LEAD_CATEGORIES.map(({ label: c }) => {
                  const active = (draft.categories || []).includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCategory(c)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Requirement" className="mt-3">
              <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Expected date of closure">
                <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Status">
                <select value={draft.stage} onChange={(e) => set('stage', e.target.value as InboundStage)} className={inputCls}>
                  {INBOUND_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {draft.stage === 'Followup Required' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Follow-up date">
                  <input type="date" value={draft.followUpDate || ''} onChange={(e) => set('followUpDate', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Follow-up time">
                  <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}

            {draft.stage === 'PI Shared' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="ENQ ID">
                    <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Value (₹)">
                    <input type="number" min={0} value={draft.value || ''} onChange={(e) => set('value', Number(e.target.value) || 0)} className={inputCls} />
                  </Field>
                </div>
                <Field label="PI status" className="mt-3">
                  <select value={draft.piStatus || ''} onChange={(e) => set('piStatus', e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {KAM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </>
            )}

            {draft.stage === 'Lost' && (
              <Field label="Lost reason" className="mt-3">
                <textarea value={draft.lostReason || ''} onChange={(e) => set('lostReason', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
              </Field>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto sticky bottom-0 flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Close</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]';
const readonlyCls = 'w-full px-2.5 py-1.5 text-[12px] rounded-md bg-gray-50 text-gray-700 border border-transparent';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function InboundLeads() {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [owner, setOwner] = useState('all');
  const [priority, setPriority] = useState('all');
  const [stage, setStage] = useState<'all' | InboundStage>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<InboundStage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const ownerId = useMemo(
    () => (owner === 'all' ? undefined : B2B_INBOUND_OWNER_LIST.find((o) => o.name === owner)?.id),
    [owner],
  );

  const runSearch = () => setAppliedSearch(search.trim());
  const clearSearch = () => { setSearch(''); setAppliedSearch(''); };

  const load = () => {
    setLoading(true);
    setError(null);
    fetchInboundBoard({ page: 0, ownerId, search: appliedSearch })
      .then((res) => {
        setLeads(res.leads);
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  };

  // Refetch from page 0 whenever the owner filter or search changes.
  useEffect(() => { load(); }, [ownerId, appliedSearch]);

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    fetchInboundBoard({ page: page + 1, ownerId, search: appliedSearch })
      .then((res) => {
        setLeads((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...prev, ...res.leads.filter((l) => !seen.has(l.id))];
        });
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .finally(() => setLoadingMore(false));
  };

  // ── List view: discrete pagination (replace page, not accumulate) ──
  const [listPage, setListPage] = useState(0);
  const [listLeads, setListLeads] = useState<InboundLead[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => { setListPage(0); }, [ownerId, appliedSearch]);

  useEffect(() => {
    if (view !== 'list') return;
    let alive = true;
    setListLoading(true);
    fetchInboundBoard({ page: listPage, ownerId, search: appliedSearch })
      .then((res) => {
        if (!alive) return;
        setListLeads(res.leads);
        setListTotal(res.total);
      })
      .finally(() => { if (alive) setListLoading(false); });
    return () => { alive = false; };
  }, [view, listPage, ownerId, appliedSearch]);

  const listTotalPages = Math.max(1, Math.ceil(listTotal / B2B_INBOUND_PAGE_SIZE));
  const listFiltered = useMemo(
    () => listLeads.filter((l) =>
      (priority === 'all' || l.priority === priority) &&
      (stage === 'all' || l.stage === stage),
    ),
    [listLeads, priority, stage],
  );

  const ownerOptions = useMemo(() => B2B_INBOUND_OWNER_LIST.map((o) => o.name).sort(), []);

  const filtered = useMemo(() => leads.filter((l) =>
    (priority === 'all' || l.priority === priority) &&
    (stage === 'all' || l.stage === stage)
  ), [leads, priority, stage]);

  const byStage = (s: InboundStage) => filtered.filter((l) => l.stage === s);

  const moveLead = (id: string, stage: InboundStage) =>
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, stage };
      upsertInboundLead(updated);
      return updated;
    }));

  const handleDrop = (stage: InboundStage) => {
    if (dragId) moveLead(dragId, stage);
    setDragId(null);
    setDragOverStage(null);
  };

  const selected = leads.find((l) => l.id === selectedId) || null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Inbound Leads</h1>
          <p className="text-xs text-gray-400 mt-0.5">Synced from Kylas · Hardi &amp; Mandeep{loading ? ' · loading…' : ` · ${leads.length}${total > leads.length ? ` of ${total}` : ''}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {(['kanban', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[12px] font-semibold capitalize ${view === v ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50">↻ Sync from Kylas</button>
        </div>
      </div>

      {/* ── Stage summary cards ── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        {INBOUND_STAGES.map((s) => (
          <div key={s} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate">{s}</div>
            <div className="text-2xl font-bold text-gray-800 mt-0.5">{s === 'New' ? total : byStage(s).length}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Search</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="Name or phone…"
                className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]"
              />
              {search && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={runSearch}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px]">
            <option value="all">All Reps</option>
            {ownerOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as 'all' | InboundStage)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px]">
            <option value="all">All Stages</option>
            {INBOUND_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[100px]">
            <option value="all">All</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <button onClick={() => { setOwner('all'); setPriority('all'); setStage('all'); clearSearch(); }} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500">Clear</button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          Couldn&apos;t load leads from Kylas: {error}
        </div>
      )}

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {INBOUND_STAGES.map((s) => {
            const items = byStage(s);
            const isOver = dragOverStage === s;
            return (
              <div
                key={s}
                className="w-[220px] shrink-0"
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(s); }}
                onDragLeave={() => setDragOverStage((cur) => (cur === s ? null : cur))}
                onDrop={() => handleDrop(s)}
              >
                <div className={`bg-white rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
                  <div className="h-1" style={{ background: INBOUND_STAGE_COLORS[s] }} />
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s}</span>
                    <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                  </div>
                  <div className="p-2 flex flex-col gap-2 min-h-[80px]">
                    {items.length === 0
                      ? <div className="text-[11px] text-gray-300 text-center py-4">{isOver ? 'Drop here' : 'No leads'}</div>
                      : items.map((l) => (
                        <LeadCard
                          key={l.id}
                          lead={l}
                          onClick={() => setSelectedId(l.id)}
                          onDragStart={() => setDragId(l.id)}
                        />
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Company', 'Contact', 'Type', 'Stage', 'Priority', 'Owner', 'Source', 'Value'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listFiltered.map((l) => (
                <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{l.company}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono">{l.phone}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.accountType}</td>
                  <td className="px-3 py-2.5"><StageBadge s={l.stage} /></td>
                  <td className="px-3 py-2.5"><PriorityBadge p={l.priority} /></td>
                  <td className="px-3 py-2.5 text-gray-500">{l.owner}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.source}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{l.value ? fmtINR(l.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {listLoading && (
            <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-gray-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
              Loading…
            </div>
          )}
          {!listLoading && listFiltered.length === 0 && (
            <div className="text-[11px] text-gray-300 text-center py-6">No leads on this page</div>
          )}
          {/* ── List pagination ── */}
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              Page {listPage + 1} of {listTotalPages} · {listTotal} leads
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                disabled={listPage === 0 || listLoading}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40 hover:enabled:border-[#0F766E] hover:enabled:text-[#0F766E]"
              >
                ← Prev
              </button>
              <button
                onClick={() => setListPage((p) => Math.min(listTotalPages - 1, p + 1))}
                disabled={listPage >= listTotalPages - 1 || listLoading}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40 hover:enabled:border-[#0F766E] hover:enabled:text-[#0F766E]"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Load more (kanban only) ── */}
      {view === 'kanban' && !loading && filtered.length > 0 && (
        <div className="flex items-center justify-center py-4">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
              Loading more…
            </div>
          ) : hasMore ? (
            <button
              onClick={loadMore}
              className="px-4 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              Load more{total > leads.length ? ` · ${leads.length} of ${total}` : ''}
            </button>
          ) : (
            <span className="text-[11px] text-gray-300">End of leads</span>
          )}
        </div>
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => {
            const updated = { ...selected, ...patch };
            setLeads((prev) => prev.map((l) => (l.id === selected.id ? updated : l)));
            upsertInboundLead(updated);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
