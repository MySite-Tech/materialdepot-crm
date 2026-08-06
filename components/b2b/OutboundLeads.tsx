'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  OUTBOUND_STAGES, OUTBOUND_STAGE_COLORS, B2B_REPS, KAM_STAGES,
  PRODUCT_CATEGORIES,
  fmtL, fmtINR, ordinal, type OutboundLead, type OutboundStage, type ProductCategory,
} from './mockData';
import { fetchOutboundLeads, upsertOutboundLead } from '@/lib/b2bLeads';
import { ExportButton, exportRowsCsv, exportRowsExcel, todayStr, useDragAutoScroll, type ExportFormat, type ExportScope } from './exportUtils';

const OUTBOUND_EXPORT_HEADERS = ['Company', 'Contact', 'Type', 'Stage', 'Segment', 'Visits', 'BDA', 'Value'];
const outboundToRow = (l: OutboundLead): (string | number)[] => [
  l.company || '', l.contactName || '', l.accountType || '', l.stage || '', l.segment || '',
  ordinal(l.visitCount), l.bda || '', l.value != null ? l.value : '',
];

function StageBadge({ s }: { s: OutboundStage }) {
  const c = OUTBOUND_STAGE_COLORS[s];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c + '18', color: c }}>
      {s}
    </span>
  );
}

function LeadCard({
  lead, onClick, onDragStart,
}: {
  lead: OutboundLead;
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
      <div className="text-[11px] text-gray-400 mt-0.5">{lead.contactName} · {ordinal(lead.visitCount)} Visit</div>
      <div className="flex items-center justify-between mt-2">
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">{lead.segment}</span>
        <span className="text-[11px] font-mono font-semibold text-gray-700">{fmtL(lead.value)}</span>
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

function LeadDrawer({
  lead, onClose, onSave,
}: {
  lead: OutboundLead;
  onClose: () => void;
  onSave: (patch: Partial<OutboundLead>) => void;
}) {
  const [draft, setDraft] = useState<OutboundLead>(lead);
  const [noteText, setNoteText] = useState('');

  const set = <K extends keyof OutboundLead>(k: K, v: OutboundLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggleCategory = (c: ProductCategory) => {
    const cur = draft.categories || [];
    set('categories', cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
  };

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    set('notes', [...(draft.notes || []), { ts: 'just now', author: draft.bda, text }]);
    setNoteText('');
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
              {draft.contactName} · {draft.accountType} · <StageBadge s={draft.stage} />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Visit brief + notes */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Visit brief</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Segment">
                  <select value={draft.segment} onChange={(e) => set('segment', e.target.value)} className={inputCls}>
                    {['Seg 1', 'Seg 2', 'Seg 3'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Visits">
                  <input type="number" min={0} value={draft.visitCount} onChange={(e) => set('visitCount', Number(e.target.value) || 0)} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Monthly order value (₹)">
                  <input type="number" min={0} value={draft.value} onChange={(e) => set('value', Number(e.target.value) || 0)} className={inputCls} />
                </Field>
                <Field label="BDA">
                  <select value={draft.bda} onChange={(e) => set('bda', e.target.value)} className={inputCls}>
                    {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Next meeting date">
                  <input type="date" value={draft.nextMeetingDate || ''} onChange={(e) => set('nextMeetingDate', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Next meeting time">
                  <input type="time" value={draft.nextMeetingTime || ''} onChange={(e) => set('nextMeetingTime', e.target.value)} className={inputCls} />
                </Field>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Meeting / visit notes</span>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this visit or meeting..."
                rows={3}
                className={inputCls + ' resize-none mt-2'}
              />
              <button onClick={addNote} className="mt-2 bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold w-full">+ Add Note</button>
              <div className="mt-3 flex flex-col gap-2">
                {(draft.notes || []).length === 0 ? (
                  <p className="text-[11px] text-gray-300 text-center py-2">No notes yet — log what was discussed on each visit.</p>
                ) : (
                  (draft.notes || []).slice().reverse().map((n, i) => (
                    <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
                      <div className="text-gray-700">{n.text}</div>
                      <div className="text-gray-400 mt-1">{n.author} · {n.ts}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Requirement details */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Requirement details</span>
            <Field label="Category" className="mt-3">
              <div className="flex flex-wrap gap-2">
                {PRODUCT_CATEGORIES.map((c) => {
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
                <select value={draft.stage} onChange={(e) => set('stage', e.target.value as OutboundStage)} className={inputCls}>
                  {OUTBOUND_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {(draft.stage === 'PI Shared' || draft.stage === 'Closed') && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">PI details</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="ENQ ID">
                    <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Value (₹)">
                    <input type="number" min={0} value={draft.piValue ?? ''} onChange={(e) => set('piValue', Number(e.target.value) || 0)} className={inputCls} />
                  </Field>
                </div>
                <Field label="PI status" className="mt-3">
                  <select value={draft.piStatus || ''} onChange={(e) => set('piStatus', e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {KAM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {draft.stage === 'Lost' && (
              <Field label="Lost reason" className="mt-4 pt-4 border-t border-gray-100">
                <textarea value={draft.lostReason || ''} onChange={(e) => set('lostReason', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
              </Field>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto sticky bottom-0 flex items-center justify-between px-6 py-4 bg-white border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Close</button>
          <button onClick={() => onSave(draft)} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

const VISIT_OPTIONS = [1, 2, 3, 4, 5];

function AddLeadModal({ onClose, onAdd }: { onClose: () => void; onAdd: (lead: OutboundLead) => void }) {
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [segment, setSegment] = useState('Seg 1');
  const [value, setValue] = useState(0);
  const [visitCount, setVisitCount] = useState(1);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [stage, setStage] = useState<OutboundStage>('Yet to Meet');
  const [nextMeetingDate, setNextMeetingDate] = useState('');
  const [nextMeetingTime, setNextMeetingTime] = useState('');
  const [expectedClosure, setExpectedClosure] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [bda, setBda] = useState(B2B_REPS[0]);

  const toggleCategory = (c: ProductCategory) =>
    setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const save = () => {
    if (!company.trim()) return;
    const note = openingNote.trim();
    onAdd({
      id: `OB-${Date.now()}`,
      company: company.trim(),
      contactName: contactName.trim(),
      phone: phone.trim() || undefined,
      accountType: 'Interior Designer',
      stage,
      bda,
      segment,
      visitCount,
      value,
      expectedClosure: expectedClosure || undefined,
      nextMeetingDate: nextMeetingDate || undefined,
      nextMeetingTime: nextMeetingTime || undefined,
      categories,
      notes: note ? [{ ts: 'just now', author: bda, text: note }] : [],
    });
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[560px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Add Outbound Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name">
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contact person">
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contact number">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Segment">
              <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inputCls}>
                {['Seg 1', 'Seg 2', 'Seg 3'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Monthly order value (₹)">
              <input type="number" min={0} value={value || ''} onChange={(e) => setValue(Number(e.target.value) || 0)} className={inputCls} />
            </Field>
            <Field label="Visit status">
              <select value={visitCount} onChange={(e) => setVisitCount(Number(e.target.value))} className={inputCls}>
                {VISIT_OPTIONS.map((v) => <option key={v} value={v}>{ordinal(v)} Visit</option>)}
              </select>
            </Field>
          </div>

          <Field label="Requirement">
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((c) => {
                const active = categories.includes(c);
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

          <Field label="Status">
            <select value={stage} onChange={(e) => setStage(e.target.value as OutboundStage)} className={inputCls}>
              {OUTBOUND_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Next meeting date">
              <input type="date" value={nextMeetingDate} onChange={(e) => setNextMeetingDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Next meeting time">
              <input type="time" value={nextMeetingTime} onChange={(e) => setNextMeetingTime(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Expected date of closure">
            <input type="date" value={expectedClosure} onChange={(e) => setExpectedClosure(e.target.value)} className={inputCls} />
          </Field>

          <Field label="Opening note (optional)">
            <textarea value={openingNote} onChange={(e) => setOpeningNote(e.target.value)} rows={3} placeholder="First impressions, requirement details..." className={inputCls + ' resize-none'} />
          </Field>

          <Field label="Owner (BDM)">
            <select value={bda} onChange={(e) => setBda(e.target.value)} className={inputCls}>
              {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button onClick={save} disabled={!company.trim()} className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">Save Lead</button>
        </div>
      </div>
    </div>
  );
}

export default function OutboundLeads() {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [owner, setOwner] = useState('all');
  const [leads, setLeads] = useState<OutboundLead[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<OutboundStage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [createdFrom, setCreatedFrom] = useState(''); // 'YYYY-MM-DD', filtered in Supabase
  const [createdTo, setCreatedTo] = useState('');

  useEffect(() => {
    let alive = true;
    fetchOutboundLeads({ createdFrom, createdTo }).then((l) => { if (alive) setLeads(l); });
    return () => { alive = false; };
  }, [createdFrom, createdTo]);

  const filtered = useMemo(() => leads.filter((l) => owner === 'all' || l.bda === owner), [leads, owner]);
  const byStage = (s: OutboundStage) => filtered.filter((l) => l.stage === s);

  const [exporting, setExporting] = useState(false);
  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    const list = scope === 'all' ? leads : filtered;
    if (!list.length) { alert('No leads to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_outbound_leads_${scope}_${todayStr()}`;
      const rows = list.map(outboundToRow);
      if (format === 'csv') exportRowsCsv(OUTBOUND_EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(OUTBOUND_EXPORT_HEADERS, rows, name, 'Outbound Leads');
    } finally {
      setExporting(false);
    }
  };

  const moveLead = (id: string, stage: OutboundStage) =>
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, stage };
      upsertOutboundLead(updated);
      return updated;
    }));

  const handleDrop = (stage: OutboundStage) => {
    if (dragId) moveLead(dragId, stage);
    setDragId(null);
    setDragOverStage(null);
  };

  const selected = leads.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Outbound Leads</h1>
          <p className="text-xs text-gray-400 mt-0.5">Field visits · architects &amp; interior designers</p>
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
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button onClick={() => setAdding(true)} className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap">+ Add Lead</button>
        </div>
      </div>

      {/* ── Stage summary cards ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {OUTBOUND_STAGES.map((s) => (
          <div key={s} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 truncate">{s}</div>
            <div className="text-2xl font-bold text-gray-800 mt-0.5">{byStage(s).length}</div>
          </div>
        ))}
      </div>

      {/* ── Filter ── */}
      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px]">
            <option value="all">All Reps</option>
            {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Created From</label>
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Created To</label>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white"
          />
        </div>
        <button
          onClick={() => { setOwner('all'); setCreatedFrom(''); setCreatedTo(''); }}
          className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500"
        >
          Clear
        </button>
      </div>

      {view === 'kanban' ? (
        <div
          ref={kanbanScroll.ref}
          className="flex gap-3 overflow-x-auto pb-3"
          onDragOver={kanbanScroll.onDragOver}
          onDragEnd={kanbanScroll.onDragEnd}
          onDrop={kanbanScroll.onDrop}
        >
          {OUTBOUND_STAGES.map((s) => {
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
                  <div className="h-1" style={{ background: OUTBOUND_STAGE_COLORS[s] }} />
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
                {['Company', 'Contact', 'Type', 'Stage', 'Segment', 'Visits', 'BDA', 'Value'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{l.company}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.contactName}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.accountType}</td>
                  <td className="px-3 py-2.5"><StageBadge s={l.stage} /></td>
                  <td className="px-3 py-2.5 text-gray-500">{l.segment}</td>
                  <td className="px-3 py-2.5 text-gray-500">{ordinal(l.visitCount)}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.bda}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{fmtINR(l.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddLeadModal
          onClose={() => setAdding(false)}
          onAdd={(lead) => {
            setLeads((prev) => [lead, ...prev]);
            upsertOutboundLead(lead);
            setAdding(false);
          }}
        />
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => {
            const updated = { ...selected, ...patch };
            setLeads((prev) => prev.map((l) => (l.id === selected.id ? updated : l)));
            upsertOutboundLead(updated);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
