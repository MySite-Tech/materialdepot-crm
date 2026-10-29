'use client';

import InboundDrawer from '../../drawers/inbound/index';

import { InboundStatus, closureReadiness, hasConnected, statusGateErrors, istToday, withStatusStamps } from '../../models/inbound';
import { InboundLead, fmtINR } from '../../models/mock-data';
import { useDragAutoScroll } from '../../hooks/use-drag-auto-scroll';
import { ExportFormat, ExportScope } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { Spinner } from '../../ui/inbound-chips';
import { EXPORT_HEADERS, LENS_KEYS, NO_FILTERS } from './constants';
import { MoveModal } from './ui/modals';
import { InboundBoard } from './ui/board';
import { InboundFilterBar } from './ui/filters';
import { LeadTable } from './ui/table';
import { InboundFilters, Lens, View } from './types';
import { LensPills, LensTiles } from '../../ui/lens-tiles';
import { activeFilterCount, byNewestLeadFirst, countsTomorrow, lensMatches, lensValues, matchesFilters, sidePills, sortForLens, tileFigures, tileGroups, toExportRow } from './utils';
import { fetchInboundBoard, upsertInboundLead } from '@/lib/b2b';
import { B2B_INBOUND_OWNER_LIST } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { runInboundRotation } from '@/lib/b2b/team';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { rotationOrder, teamMembers } from '@/lib/b2b/team/utils';

export default function InboundLeads({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const [view, setView] = useState<View>('list');
  const [lens, setLens] = useState<Lens>('today');
  const [scopeChoice, setScopeChoice] = useState<'mine' | 'all' | null>(null);
  const [rotationNote, setRotationNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const [f, setF] = useState<InboundFilters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [listPage, setListPage] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [move, setMove] = useState<{ lead: InboundLead; target: InboundStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const today = istToday();

  const inboundOwners = useMemo(() => {
    const members = teamMembers(team.members, 'inbound').map((m) => ({ id: m.kylasUserId as number, name: m.name }));
    return members.length ? members : B2B_INBOUND_OWNER_LIST;
  }, [team.members]);
  const boardOwnerKey = [...new Set([...B2B_INBOUND_OWNER_LIST, ...inboundOwners].map((o) => o.id))].join(',');
  const boardOwnerIds = useMemo(() => boardOwnerKey.split(',').map(Number), [boardOwnerKey]);
  const ownerName = useMemo(() => new Map(inboundOwners.map((o) => [o.id, o.name])), [inboundOwners]);

  const me = viewer.member?.team === 'inbound' && viewer.member.active ? viewer.member : null;
  const myKylasId = me?.kylasUserId ?? undefined;
  const scope = scopeChoice ?? (myKylasId ? 'mine' : 'all');

  const ownerId = useMemo(
    () => (scope === 'mine'
      ? myKylasId
      : f.owner === 'all' ? undefined : inboundOwners.find((o) => o.name === f.owner)?.id),
    [scope, myKylasId, f.owner, inboundOwners],
  );
  const serverOpts = useMemo(() => ({
    ownerId, ownerIds: boardOwnerIds, search: appliedSearch, createdFrom: f.createdFrom,
    createdTo: f.createdTo, kylasStage: f.kylasStage === 'all' ? undefined : Number(f.kylasStage),
  }), [ownerId, boardOwnerIds, appliedSearch, f.createdFrom, f.createdTo, f.kylasStage]);

  const load = () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    fetchInboundBoard({ page: 0, ...serverOpts })
      .then((res) => {
        if (!res.ok) throw new Error('Kylas or the CRM database did not answer, so the board is missing leads. Nothing is counted until it loads.');
        setLeads(res.leads);
        setPage(res.page);
        setHasMore(res.hasMore);
        setTotal(res.total);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load leads');
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (!team.loading) load(); }, [serverOpts, team.loading]);

  const rotationReady = !team.loading && rotationOrder(team.members).length > 0;
  useEffect(() => {
    if (!rotationReady) return;
    runInboundRotation()
      .then((r) => {
        if (r.failed.length) {
          setRotationNote({ tone: 'warn', text: `Round robin could not assign ${r.failed.length} lead${r.failed.length === 1 ? '' : 's'}: ${r.failed[0].error}` });
        } else if (r.assigned.length) {
          setRotationNote({ tone: 'ok', text: `${r.assigned.length} new lead${r.assigned.length === 1 ? '' : 's'} shared out round robin just now.` });
        }
        if (r.assigned.length) load();
      })
      .catch((e) => setRotationNote({ tone: 'warn', text: `Round robin did not run: ${e instanceof Error ? e.message : String(e)}` }));
  }, [rotationReady]);

  const named = useMemo(() => leads.map((l) => {
    const n = l.ownerId != null ? ownerName.get(l.ownerId) : undefined;
    return n && n !== l.owner ? { ...l, owner: n } : l;
  }), [leads, ownerName]);

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    fetchInboundBoard({ page: page + 1, ...serverOpts })
      .then((res) => {
        if (!res.ok) { setError('Could not load more leads from Kylas. Try again.'); return; }
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

  const filtered = useMemo(
    () => named.filter((l) => matchesFilters(l, f)).sort(byNewestLeadFirst),
    [named, f],
  );

  const byLens = useMemo(() => {
    const out = Object.fromEntries(LENS_KEYS.map((k) => [k, [] as InboundLead[]])) as Record<Lens, InboundLead[]>;
    for (const l of filtered) for (const k of LENS_KEYS) if (lensMatches(k, l, today)) out[k].push(l);
    return out;
  }, [filtered, today]);

  const counts = useMemo(
    () => Object.fromEntries(LENS_KEYS.map((k) => [k, byLens[k].length])) as Record<Lens, number>,
    [byLens],
  );

  const tomorrow = useMemo(() => filtered.filter((l) => countsTomorrow(l, today)).length, [filtered, today]);
  const values = useMemo(() => lensValues(byLens, tomorrow), [byLens, tomorrow]);
  const figures = tileFigures(counts, values, fmtINR);

  const valueText = lens === 'pi' && values.pi ? `${fmtINR(values.pi)} open on deal tickets`
    : lens === 'closed' && values.closed ? `${fmtINR(values.closed)} ordered`
      : undefined;

  const rows = useMemo(() => sortForLens(lens, byLens[lens], today), [lens, byLens, today]);

  useEffect(() => { setListPage(0); }, [serverOpts, f, lens]);

  const pickLens = (k: Lens) => {
    setLens(k);
    setView('list');
  };

  const runSearch = (q: string) => {
    setAppliedSearch(q);
    if (q) pickLens('all');
  };

  const applyPatch = async (lead: InboundLead, patch: Partial<InboundLead>) => {
    const updated: InboundLead = withStatusStamps(lead, {
      ...lead,
      ...patch,
      value: Number(patch.orderValue ?? lead.orderValue) || 0,
    }, new Date().toISOString());

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    const err = await upsertInboundLead(updated);
    if (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      setMoveError(`Could not move ${lead.companyName || lead.company}: ${err}`);
    }
  };

  const requestMove = (id: string, target: InboundStatus) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === target) return;
    setMoveError(null);
    const errs = statusGateErrors({
      status: target,
      followUpDate: lead.followUpDate,
      enqId: lead.enqId,
      lostReason: lead.lostReason,
      invalidReason: lead.invalidReason,
      invalidNote: lead.invalidNote,
      calls: lead.callAttempts?.length,
      connected: hasConnected(lead.callAttempts),
      readiness: closureReadiness(lead, today),
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
      if (!res.ok) throw new Error(`page ${p + 1} did not load from Kylas`);
      for (const l of res.leads) if (!seen.has(l.id)) { seen.add(l.id); all.push(l); }
      if (!res.hasMore) break;
      p += 1;
      await new Promise((r) => setTimeout(r, 250));
    }
    return all;
  };

  const handleExport = async (format: ExportFormat, exportScope: ExportScope) => {
    if (exporting) return;
    setExporting(true);
    try {
      let list = await fetchAll(exportScope === 'all' ? { ownerIds: boardOwnerIds } : serverOpts);
      if (exportScope !== 'all') {
        list = list.filter((l) => matchesFilters(l, f) && (view === 'board' || lensMatches(lens, l, today)));
      }
      if (!list.length) { setError('No leads matched — nothing to export.'); return; }
      const name = `b2b_inbound_leads_${exportScope === 'all' ? 'all' : lens}_${todayStr()}`;
      const out = list.sort(byNewestLeadFirst).map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, out, name);
      else await exportRowsExcel(EXPORT_HEADERS, out, name, 'Inbound Leads');
    } catch (e) {
      setError('Export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => setF(NO_FILTERS);
  const activeFilters = activeFilterCount(f);

  const selected = named.find((l) => l.id === selectedId) || null;
  const kanbanScroll = useDragAutoScroll<HTMLDivElement>();

  const emptyAction = (
    <div className="flex items-center gap-2">
      {lens === 'today' && counts.upcoming > 0 && (
        <button onClick={() => pickLens('upcoming')} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]">
          See {counts.upcoming} upcoming →
        </button>
      )}
      {activeFilters > 0 && (
        <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-600 hover:border-gray-400">
          Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6">

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Inbound Leads</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            {scope === 'mine'
              ? `Your leads, ${me?.name ?? ''}`
              : <span title={inboundOwners.map((o) => o.name).join(', ')}>Every inbound owner</span>}
            {loading ? ' · loading…' : ` · ${filtered.length} loaded`}
            {!loading && total > 0 && <span className="text-gray-400"> · {total} unactioned in Kylas</span>}
            {!loading && hasMore && <span className="text-gray-400"> · counts cover loaded leads only</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {myKylasId && (
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              {([['mine', 'Mine'], ['all', 'All inbound']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => { setScopeChoice(k); setF((p) => ({ ...p, owner: 'all' })); }}
                  className={`px-3 py-1.5 text-[12px] font-semibold ${scope === k ? 'bg-[#EAB308] text-[#1A1A1A]' : 'bg-white text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {(['list', 'board'] as const).map((v) => (
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

      {viewer.member?.team === 'inbound' && !myKylasId && (
        <p className="text-[12px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">
          You are on the inbound team but your Kylas user is not linked, so no lead can be yours yet. A B2B manager
          links it under <strong>Team</strong>.
        </p>
      )}
      {rotationNote && (
        <p className={`text-[12px] rounded px-3 py-2 mb-3 border ${rotationNote.tone === 'ok' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {rotationNote.text}
        </p>
      )}

      <LensTiles groups={tileGroups(counts, figures, loading ? 'pending' : loadFailed ? 'failed' : null)} active={view === 'list' ? lens : null} onPick={pickLens} />

      <InboundFilterBar
        f={f}
        set={(patch) => setF((p) => ({ ...p, ...patch }))}
        onClear={clearFilters}
        ownerOptions={scope === 'mine' ? null : inboundOwners.map((o) => o.name)}
        search={search}
        setSearch={setSearch}
        onSearch={runSearch}
        aside={<LensPills pills={sidePills(counts, loading || loadFailed)} active={view === 'list' ? lens : null} onPick={pickLens} />}
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

      {loading ? <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads from Kylas and the CRM…" /></div>
        : loadFailed ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
            <p className="text-[12px] text-gray-600">Leads did not load, so nothing here can be counted yet.</p>
            <button onClick={load} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Try again</button>
          </div>
        ) : view === 'board' ? (
          <InboundBoard leads={filtered} today={today} total={total} scroll={kanbanScroll} onOpen={setSelectedId} onMove={requestMove} />
        ) : (
          <LeadTable
            lens={lens}
            rows={rows}
            today={today}
            showOwner={scope === 'all'}
            searchQuery={appliedSearch}
            valueText={valueText}
            page={listPage}
            setPage={setListPage}
            onOpen={setSelectedId}
            onClearSearch={() => { setSearch(''); setAppliedSearch(''); }}
            emptyAction={emptyAction}
          />
        )}

      {!loading && hasMore && (
        <div className="flex items-center justify-center py-4">
          {loadingMore ? <Spinner label="Loading more…" /> : (
            <button
              onClick={loadMore}
              className="px-4 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              Load more from Kylas{total > 0 ? ` · ${total} unactioned in total` : ''}
            </button>
          )}
        </div>
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
          actorName={viewer.name}
          members={teamMembers(team.members, 'inbound')}
          canReassign={viewer.isManager || !!me}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
        />
      )}
    </div>
  );
}
