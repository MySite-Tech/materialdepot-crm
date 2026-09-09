'use client';

import { InboundBuckets } from './buckets';
import { InboundDailyPanel } from './daily-panel';

import InboundDrawer from '../../drawers/inbound/index';

import { CLIENT_TYPES, INBOUND_LOCATIONS, INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT, InboundStatus, LEAD_TYPES, PRIORITIES, Priority, followUpBucket, istToday, lastAttempt, statusGateErrors } from '../../models/inboundModel';
import { InboundLead, NEW_KYLAS_STAGES, fmtINR } from '../../models/mockData';
import { ExportButton, ExportFormat, ExportScope, exportRowsCsv, exportRowsExcel, todayStr, useDragAutoScroll } from '../../ui/exportUtils';
import { Empty, EnrichmentBadge, LeadName, LeadTypeChip, PriorityChip, Spinner, StatusBadge, fmtDay, inputCls } from '../../ui/inboundChips';
import { EXPORT_HEADERS } from '../../constants/inbound-leads';
import { MoveModal } from './modals';
import { DailyTable } from './table';
import { View } from '../../types/inbound-leads';
import { LeadCard, SidePanel, Tile } from './ui';
import { gapsFor, istDay, toExportRow } from '../../utils/inbound-leads';
import { B2B_FRESH_START, fetchInboundBoard, upsertInboundLead } from '@/lib/b2bLeads';
import { B2B_INBOUND_OWNER_LIST, B2B_INBOUND_PAGE_SIZE } from '@/lib/mockApi';
import { useEffect, useMemo, useState } from 'react';

export default function InboundLeads() {
  const [view, setView] = useState<View>('today');

  const [owner, setOwner] = useState('all');
  const [status, setStatus] = useState<'all' | InboundStatus>('all');
  const [priority, setPriority] = useState<'all' | Priority>('all');
  const [clientType, setClientType] = useState('all');
  const [leadType, setLeadType] = useState('all');
  const [location, setLocation] = useState('all');
  const [newKylasStage, setNewKylasStage] = useState<'all' | number>('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<InboundStatus | null>(null);
  const [move, setMove] = useState<{ lead: InboundLead; target: InboundStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const today = istToday();

  const ownerId = useMemo(
    () => (owner === 'all' ? undefined : B2B_INBOUND_OWNER_LIST.find((o) => o.name === owner)?.id),
    [owner],
  );
  const kylasStageFilter = newKylasStage === 'all' ? undefined : newKylasStage;
  const serverOpts = useMemo(() => ({
    ownerId, search: appliedSearch, createdFrom: createdAfter,
    createdTo: createdBefore, kylasStage: kylasStageFilter,
  }), [ownerId, appliedSearch, createdAfter, createdBefore, kylasStageFilter]);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchInboundBoard({ page: 0, ...serverOpts })
      .then((res) => {
        setLeads(res.leads);
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [serverOpts]);

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    fetchInboundBoard({ page: page + 1, ...serverOpts })
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

  const filtered = useMemo(() => leads.filter((l) => {
    if (status !== 'all' && l.stage !== status) return false;
    if (priority !== 'all' && l.priority !== priority) return false;
    if (clientType !== 'all' && l.clientType !== clientType) return false;
    if (leadType !== 'all' && l.leadType !== leadType) return false;
    if (location !== 'all' && l.location !== location) return false;
    if (onlyGaps && gapsFor(l).length === 0) return false;
    return true;
  }), [leads, status, priority, clientType, leadType, location, onlyGaps]);

  const byStatus = (s: InboundStatus) => filtered.filter((l) => l.stage === s);

  const summary = useMemo(() => {
    const pi = filtered.filter((l) => l.stage === 'PI Shared');
    const closed = filtered.filter((l) => l.stage === 'Closed');
    const lost = filtered.filter((l) => l.stage === 'Lost');
    const sum = (ls: InboundLead[]) => ls.reduce((a, l) => a + (Number(l.orderValue) || 0), 0);
    const newToday = filtered.filter((l) => istDay(l.leadCreatedAt) === today).length;
    const closedToday = closed.filter((l) => istDay(l.statusChangedAt) === today).length;
    const piToday = pi.filter((l) => istDay(l.statusChangedAt) === today).length;
    const overdue = filtered.filter((l) =>
      (l.stage === 'Follow up' || l.stage === 'PI Shared') && followUpBucket(l.followUpDate, today) === 'overdue').length;
    const dueToday = filtered.filter((l) =>
      (l.stage === 'Follow up' || l.stage === 'PI Shared') && followUpBucket(l.followUpDate, today) === 'today').length;
    const untimed = [...pi, ...closed].filter((l) => !l.statusChangedAt).length;
    return {
      newToday, overdue, dueToday, untimed,
      pi: { n: pi.length, value: sum(pi), today: piToday },
      closed: { n: closed.length, value: sum(closed), today: closedToday },
      lost: { n: lost.length },
      gaps: filtered.filter((l) => gapsFor(l).length > 0).length,
    };
  }, [filtered, today]);

  const applyPatch = async (lead: InboundLead, patch: Partial<InboundLead>) => {
    const statusChanged = patch.stage !== undefined && patch.stage !== lead.stage;
    const updated: InboundLead = {
      ...lead,
      ...patch,
      statusChangedAt: statusChanged ? new Date().toISOString() : lead.statusChangedAt,
      value: Number(patch.orderValue ?? lead.orderValue) || 0,
    };

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    const err = await upsertInboundLead(updated);
    if (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      setMoveError(`Could not move ${lead.companyName || lead.company}: ${err}`);
    }
  };

  const requestMove = (id: string, target: InboundStatus) => {
    const lead = leads.find((l) => l.id === id);
    setDragId(null);
    setDragOver(null);
    if (!lead || lead.stage === target) return;
    setMoveError(null);
    const errs = statusGateErrors({
      status: target,
      followUpDate: lead.followUpDate,
      enqId: lead.enqId,
      lostReason: lead.lostReason,
    });
    if (errs.length) { setMove({ lead, target }); return; }
    applyPatch(lead, { stage: target });
  };

  const fetchAll = async (opts: Parameters<typeof fetchInboundBoard>[0]): Promise<InboundLead[]> => {
    const all: InboundLead[] = [];
    const seen = new Set<string>();
    let p = 0;
    for (;;) {
      const res = await fetchInboundBoard({ ...opts, page: p });
      for (const l of res.leads) if (!seen.has(l.id)) { seen.add(l.id); all.push(l); }
      if (!res.hasMore) break;
      p += 1;
      await new Promise((r) => setTimeout(r, 250));
    }
    return all;
  };

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    setExporting(true);
    try {
      let list = await fetchAll(scope === 'all' ? {} : serverOpts);
      if (scope !== 'all') {
        list = list.filter((l) =>
          (status === 'all' || l.stage === status)
          && (priority === 'all' || l.priority === priority)
          && (clientType === 'all' || l.clientType === clientType)
          && (leadType === 'all' || l.leadType === leadType)
          && (location === 'all' || l.location === location)
          && (!onlyGaps || gapsFor(l).length > 0));
      }
      if (!list.length) { setError('No leads matched — nothing to export.'); return; }
      const name = `b2b_inbound_leads_${scope}_${todayStr()}`;
      const rows = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(EXPORT_HEADERS, rows, name, 'Inbound Leads');
    } catch (e) {
      setError('Export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setOwner('all'); setStatus('all'); setPriority('all'); setClientType('all');
    setLeadType('all'); setLocation('all'); setNewKylasStage('all');
    setCreatedAfter(''); setCreatedBefore(''); setOnlyGaps(false);
    setSearch(''); setAppliedSearch('');
  };

  const activeFilters = [
    owner !== 'all', status !== 'all', priority !== 'all', clientType !== 'all',
    leadType !== 'all', location !== 'all', newKylasStage !== 'all',
    !!createdAfter, !!createdBefore, onlyGaps, !!appliedSearch,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  const followUpLeads = useMemo(
    () => filtered.filter((l) => l.stage === 'Follow up' || l.stage === 'PI Shared'),
    [filtered],
  );
  const newToday = useMemo(
    () => filtered.filter((l) => l.stage === 'New').sort((a, b) => (b.leadCreatedAt || '').localeCompare(a.leadCreatedAt || '')),
    [filtered],
  );
  const piLeads = useMemo(() => filtered.filter((l) => l.stage === 'PI Shared'), [filtered]);

  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [serverOpts, status, priority, clientType, leadType, location, onlyGaps]);
  const listPages = Math.max(1, Math.ceil(filtered.length / B2B_INBOUND_PAGE_SIZE));
  const listRows = filtered.slice(listPage * B2B_INBOUND_PAGE_SIZE, (listPage + 1) * B2B_INBOUND_PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6">

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Inbound Leads</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Qualified by Presales in Kylas · {B2B_INBOUND_OWNER_LIST.map((o) => o.name).join(' & ')}
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
            {!loading && total > 0 && (
              <span className="text-gray-400"> · {total} unactioned in Kylas</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {(['today', 'board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[12px] font-semibold capitalize ${view === v ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={load}
            disabled={loading}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            ↻ Sync from Kylas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        <Tile label="New today" value={String(summary.newToday)} sub="arrived in Kylas today" accent={INBOUND_STATUS_COLORS.New} />
        <Tile
          label="PI Shared"
          value={String(summary.pi.n)}
          sub={summary.pi.value ? fmtINR(summary.pi.value) : 'no order value yet'}
          accent={INBOUND_STATUS_COLORS['PI Shared']}
        />
        <Tile
          label="Closed"
          value={String(summary.closed.n)}
          sub={summary.closed.value ? fmtINR(summary.closed.value) : 'no order value yet'}
          accent={INBOUND_STATUS_COLORS.Closed}
        />
        <Tile label="Lost" value={String(summary.lost.n)} accent={INBOUND_STATUS_COLORS.Lost} />
        <Tile
          label="Overdue follow-ups"
          value={String(summary.overdue)}
          sub={`${summary.dueToday} due today`}
          accent="#DC2626"
          muted={summary.overdue === 0}
        />
        <Tile
          label="Need enrichment"
          value={String(summary.gaps)}
          sub="missing §3.2 / §3.3 fields"
          accent="#F59E0B"
          muted={summary.gaps === 0}
        />
      </div>
      <p className="text-[10px] text-gray-400 mb-4 leading-snug">
        {[
          `Counts cover the ${activeFilters ? 'current filter' : 'loaded window'}.`,
          'Order value always comes from the matched deal ticket, never a typed estimate.',
          summary.untimed > 0
            ? `${summary.untimed} PI/closed ${summary.untimed === 1 ? 'lead pre-dates' : 'leads pre-date'} status timestamps, so ${summary.untimed === 1 ? 'it is' : 'they are'} not counted into today's figures.`
            : '',
        ].filter(Boolean).join(' ')}
      </p>

      <InboundDailyPanel
        activeFilters={activeFilters}
        clearFilters={clearFilters}
        clientType={clientType}
        createdAfter={createdAfter}
        createdBefore={createdBefore}
        leadType={leadType}
        location={location}
        newKylasStage={newKylasStage}
        onlyGaps={onlyGaps}
        owner={owner}
        priority={priority}
        search={search}
        setAppliedSearch={setAppliedSearch}
        setClientType={setClientType}
        setCreatedAfter={setCreatedAfter}
        setCreatedBefore={setCreatedBefore}
        setLeadType={setLeadType}
        setLocation={setLocation}
        setNewKylasStage={setNewKylasStage}
        setOnlyGaps={setOnlyGaps}
        setOwner={setOwner}
        setPriority={setPriority}
        setSearch={setSearch}
        setStatus={setStatus}
        status={status}
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {moveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {loading ? <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads from Kylas and the CRM…" /></div> : (
        <InboundBuckets
        byStatus={byStatus}
        dragId={dragId}
        dragOver={dragOver}
        filtered={filtered}
        followUpLeads={followUpLeads}
        hasMore={hasMore}
        kanbanScroll={kanbanScroll}
        listPage={listPage}
        listPages={listPages}
        listRows={listRows}
        loadMore={loadMore}
        loadingMore={loadingMore}
        newToday={newToday}
        piLeads={piLeads}
        requestMove={requestMove}
        setDragId={setDragId}
        setDragOver={setDragOver}
        setListPage={setListPage}
        setSelectedId={setSelectedId}
        today={today}
        total={total}
        view={view}
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
        <InboundDrawer
          lead={selected}
          onClose={() => setSelectedId(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
        />
      )}
    </div>
  );
}
