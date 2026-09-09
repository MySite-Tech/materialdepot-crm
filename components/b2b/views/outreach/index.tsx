'use client';

import OutreachDrawer from '../../drawers/outreach/index';
import { B2B_REPS, OutreachLead, fmtINR } from '../../models/mock-data';
import { COMPANY_TYPES, LEAD_TYPES, OUTREACH_PRD_VIEWS, OUTREACH_STATUSES, OUTREACH_STATUS_COLORS, OUTREACH_STATUS_HINT, OutreachStatus, OutreachView, SEGMENTS, companyTypeLabel, hasMeetingOn, istToday, outreachGateErrors, outreachSummary } from '../../models/outreach';
import { useDragAutoScroll } from '../../hooks/use-drag-auto-scroll';
import { ExportFormat, ExportScope } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { Empty, EnrichmentBadge, Spinner, fmtDay, inputCls } from '../../ui/inbound-chips';
import { MeetingProgress, OutreachLeadTypeChip, OutreachStatusBadge } from '../../ui/outreach-chips';
import { EXPORT_HEADERS, PAGE_SIZE } from './constants';
import { CreateLeadModal, MoveModal } from './modals';
import { FollowUpTable, StatusTable, TodayTable } from './tables';
import { LeadCard, Tile } from './ui';
import { gapsFor, nowIso, toExportRow } from './utils';
import { fetchOutreachLeads, upsertOutreachLead } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

export default function OutreachLeads() {
  const [view, setView] = useState<OutreachView>('today');

  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [bm, setBm] = useState('all');
  const [status, setStatus] = useState<'all' | OutreachStatus>('all');
  const [companyType, setCompanyType] = useState('all');
  const [leadType, setLeadType] = useState('all');
  const [segment, setSegment] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<OutreachStatus | null>(null);
  const [move, setMove] = useState<{ lead: OutreachLead; target: OutreachStatus } | null>(null);

  const today = istToday();

  const load = () => {
    setLoading(true);
    setError(null);
    fetchOutreachLeads({ createdFrom, createdTo })
      // A failed read is reported, never rendered as "no leads" — a BM would
      // read an empty board as a day with nothing on it.
      .then(setLeads)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load outreach leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [createdFrom, createdTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (bm !== 'all' && l.bm !== bm) return false;
      if (status !== 'all' && l.status !== status) return false;
      if (companyType !== 'all' && l.companyType !== companyType) return false;
      if (leadType !== 'all' && l.leadType !== leadType) return false;
      if (segment !== 'all' && l.segment !== segment) return false;
      if (onlyGaps && gapsFor(l).length === 0) return false;
      if (q) {
        const hay = [l.company, l.contactPerson, l.phone, l.enqId, l.designation]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, bm, status, companyType, leadType, segment, onlyGaps, search]);

  const byStatus = (s: OutreachStatus) => filtered.filter((l) => l.status === s);
  const summary = useMemo(() => outreachSummary(filtered, today), [filtered, today]);

  const applyPatch = async (lead: OutreachLead, patch: Partial<OutreachLead>) => {
    const statusChanged = patch.status !== undefined && patch.status !== lead.status;
    const updated: OutreachLead = {
      ...lead,
      ...patch,
      statusChangedAt: statusChanged ? nowIso() : lead.statusChangedAt,
      quoteSharedAt: patch.status === 'Quote Share' && !lead.quoteSharedAt ? nowIso() : lead.quoteSharedAt,
      value: Number(patch.orderValue ?? lead.orderValue) || 0,
    };

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    const err = await upsertOutreachLead(updated);
    if (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      setMoveError(`Could not move ${lead.company}: ${err}`);
    }
  };

  const requestMove = (id: string, target: OutreachStatus) => {
    const lead = leads.find((l) => l.id === id);
    setDragId(null);
    setDragOver(null);
    if (!lead || lead.status === target) return;
    setMoveError(null);
    const errs = outreachGateErrors({ status: target, followUpDate: lead.followUpDate, lostReason: lead.lostReason });

    if (errs.length || target === 'Quote Share' || target === 'Closed' || target === 'PI Shared') {
      setMove({ lead, target });
      return;
    }
    applyPatch(lead, { status: target });
  };

  const createLead = async (lead: OutreachLead) => {
    setLeads((prev) => [lead, ...prev]);
    setCreating(false);
    const err = await upsertOutreachLead(lead);
    if (err) {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setError(`Could not save ${lead.company}: ${err}. The lead was not created — try again.`);
    }
  };

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    const list = scope === 'all' ? leads : filtered;
    if (!list.length) { setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_outreach_leads_${scope}_${todayStr()}`;
      const rows = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(EXPORT_HEADERS, rows, name, 'Outreach Leads');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setBm('all'); setStatus('all'); setCompanyType('all'); setLeadType('all');
    setSegment('all'); setCreatedFrom(''); setCreatedTo(''); setSearch(''); setOnlyGaps(false);
  };
  const activeFilters = [
    bm !== 'all', status !== 'all', companyType !== 'all', leadType !== 'all',
    segment !== 'all', !!createdFrom, !!createdTo, !!search.trim(), onlyGaps,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  const todayLeads = useMemo(() => filtered.filter((l) => hasMeetingOn(l.meetings, today)), [filtered, today]);
  const followUpLeads = useMemo(
    () => filtered.filter((l) => l.status === 'Follow up' || l.status === 'PI Shared' || l.status === 'Quote Share'),
    [filtered],
  );

  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [filtered.length, view]);
  const listPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const listRows = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);

  const VIEW_TABS: { key: OutreachView; label: string }[] = [
    ...OUTREACH_PRD_VIEWS.map((v) => ({ key: v.key, label: v.label })),
    { key: 'board', label: 'Board' },
    { key: 'list', label: 'List' },
  ];
  const viewNote = OUTREACH_PRD_VIEWS.find((v) => v.key === view)?.note;

  return (
    <div className="p-4 sm:p-6">

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Outreach</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Field visits — architects, interior designers, contractors &amp; builders
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={() => setCreating(true)}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap"
          >
            + Create Lead
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
        <Tile
          label="Today's meetings"
          value={String(summary.meetingsToday)}
          sub="leads with a meeting today"
          accent={OUTREACH_STATUS_COLORS['Yet to Meet']}
          muted={summary.meetingsToday === 0}
        />
        <Tile
          label="Follow up"
          value={String(summary.followUp.count)}
          sub={summary.followUp.overdue ? `${summary.followUp.overdue} overdue · ${summary.followUp.dueToday} due today` : `${summary.followUp.dueToday} due today`}
          accent={OUTREACH_STATUS_COLORS['Follow up']}
        />
        <Tile
          label="Quote Shared"
          value={String(summary.quoteShared.count)}
          sub={summary.quoteShared.estimatedValue ? `~${fmtINR(summary.quoteShared.estimatedValue)} estimated` : 'no estimate entered'}
          accent={OUTREACH_STATUS_COLORS['Quote Share']}
        />
        <Tile
          label="PI Shared"
          value={String(summary.piShared.count)}
          sub={summary.piShared.orderValue ? fmtINR(summary.piShared.orderValue) : 'no order value yet'}
          accent={OUTREACH_STATUS_COLORS['PI Shared']}
        />
        <Tile label="Lost" value={String(summary.lost)} accent={OUTREACH_STATUS_COLORS.Lost} muted={summary.lost === 0} />
      </div>
      <p className="text-[10px] text-gray-400 mb-4 leading-snug">
        Counts cover the {activeFilters ? 'current filter' : 'loaded window'}. <strong>PI Shared</strong> revenue is
        the order value fetched from the deal ticket; <strong>Quote Shared</strong> is the BM&apos;s own expected order
        value, which is why it is shown as an estimate and never added to the other.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Company, contact, phone or Enq ID…"
              className={inputCls}
            />
          </div>
          {([
            ['Status', 'All statuses', status, setStatus, ['all', ...OUTREACH_STATUSES]],
            ['BM', 'All BMs', bm, setBm, ['all', ...B2B_REPS]],
            ['Company type', 'All types', companyType, setCompanyType, ['all', ...COMPANY_TYPES]],
            ['Lead type', 'All lead types', leadType, setLeadType, ['all', ...LEAD_TYPES]],
            ['Segment', 'All segments', segment, setSegment, ['all', ...SEGMENTS]],
          ] as const).map(([label, allLabel, val, setter, opts]) => (
            <div key={label}>
              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
              <select
                value={val as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]"
              >
                {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Created from</label>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <button
            onClick={() => setOnlyGaps((v) => !v)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              onlyGaps ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
            }`}
          >
            ⚠ Needs filling
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {VIEW_TABS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${view === v.key ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {viewNote && <span className="text-[10.5px] text-gray-400">{viewNote}</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} className="text-[11px] font-semibold text-red-700 underline">Retry</button>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none">×</button>
          </div>
        </div>
      )}
      {moveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading outreach leads…" /></div>
      ) : (
        <>
          {view === 'today' && <TodayTable leads={todayLeads} today={today} onOpen={setSelectedId} />}
          {view === 'followups' && <FollowUpTable leads={followUpLeads} today={today} onOpen={setSelectedId} />}
          {view === 'pi' && <StatusTable status="PI Shared" leads={byStatus('PI Shared')} onOpen={setSelectedId} />}
          {view === 'closed' && <StatusTable status="Closed" leads={byStatus('Closed')} onOpen={setSelectedId} />}
          {view === 'lost' && <StatusTable status="Lost" leads={byStatus('Lost')} onOpen={setSelectedId} />}

          {view === 'board' && (
            <div
              ref={kanbanScroll.ref}
              className="flex gap-3 overflow-x-auto pb-3 items-start"
              onDragOver={kanbanScroll.onDragOver}
              onDragEnd={kanbanScroll.onDragEnd}
              onDrop={kanbanScroll.onDrop}
            >
              {OUTREACH_STATUSES.map((s) => {
                const items = byStatus(s);
                const isOver = dragOver === s;
                return (
                  <div
                    key={s}
                    className="flex-1 min-w-[220px] shrink-0"
                    onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
                    onDragLeave={() => setDragOver((c) => (c === s ? null : c))}
                    onDrop={() => dragId && requestMove(dragId, s)}
                  >
                    <div className={`bg-[#F2F2F3] rounded-lg border overflow-hidden transition-colors ${isOver ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20' : 'border-gray-200'}`}>
                      <div className="h-1" style={{ background: OUTREACH_STATUS_COLORS[s] }} />
                      <div className="px-3 py-2 bg-white border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">{s}</span>
                          <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                        </div>
                        <p className="text-[9.5px] text-gray-400 leading-snug mt-0.5">{OUTREACH_STATUS_HINT[s]}</p>
                      </div>
                      <div className="p-2 flex flex-col gap-2 min-h-[100px]">
                        {items.length === 0
                          ? <div className="text-[11px] text-gray-400 text-center py-5">{isOver ? 'Drop here' : 'Empty'}</div>
                          : items.map((l) => (
                            <LeadCard
                              key={l.id}
                              lead={l}
                              today={today}
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
          )}

          {view === 'list' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {['Company', 'Contact', 'Designation', 'Type', 'Seg', 'Lead', 'Status', 'Meetings',
                        'Follow-up', 'Enq ID', 'Value', 'BM', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((l) => {
                      const gaps = gapsFor(l);
                      return (
                        <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                          <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate">{l.company}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.designation || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{l.segment || '—'}</td>
                          <td className="px-3 py-2"><OutreachLeadTypeChip t={l.leadType} /></td>
                          <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                          <td className="px-3 py-2"><MeetingProgress meetings={l.meetings} /></td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{l.followUpDate ? fmtDay(l.followUpDate) : '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{l.enqId || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                            {l.orderValue ? fmtINR(l.orderValue)
                              : l.expectedOrderValue ? <span className="text-gray-400" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span>
                                : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                          <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {listRows.length === 0 && <Empty>No leads match these filters.</Empty>}
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">Page {listPage + 1} of {listPages} · {filtered.length} shown</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setListPage((p) => Math.max(0, p - 1))} disabled={listPage === 0}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
                  <button onClick={() => setListPage((p) => Math.min(listPages - 1, p + 1))} disabled={listPage >= listPages - 1}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateLeadModal
          onClose={() => setCreating(false)}
          onCreate={createLead}
          defaultBm={bm !== 'all' ? bm : B2B_REPS[0]}
        />
      )}

      {move && (
        <MoveModal
          lead={move.lead}
          target={move.target}
          onCancel={() => setMove(null)}
          onDone={(patch) => { applyPatch(move.lead, patch); setMove(null); }}
        />
      )}

      {selected && (
        <OutreachDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
        />
      )}
    </div>
  );
}
