'use client';

import InboundDrawer from '../../drawers/inbound/index';

import { InboundStatus, closureReadiness, hasConnected, statusGateErrors, istToday, withStatusStamps } from '../../models/inbound';
import { InboundLead, fmtINR } from '../../models/mock-data';
import { useDragAutoScroll } from '../../hooks/use-drag-auto-scroll';
import { useB2BReps } from '../../hooks/use-b2b-reps';
import { Spinner } from '../../ui/inbound-chips';
import { LENS_KEYS, NO_FILTERS } from './constants';
import { AddLeadModal, MoveModal } from './ui/modals';
import { InboundBoard } from './ui/board';
import { InboundFilterBar } from './ui/filters';
import { LeadTable } from './ui/table';
import { InboundFilters, Lens, View } from './types';
import { LensPills, LensTiles } from '../../ui/lens-tiles';
import { AssignBar } from '../../ui/assign-bar';
import { activeFilterCount, byNewestLeadFirst, countsTomorrow, lensMatches, lensValues, matchesFilters, sidePills, sortForLens, tileFigures, tileGroups } from './utils';
import { fetchInboundBoard, inboundBoardMatches, saveInboundLead } from '@/lib/b2b';
import { B2B_INBOUND_OWNER_LIST } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInboundSync } from '../../hooks/use-inbound-sync';
import { useInboundReassign } from '../../hooks/use-inbound-reassign';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { membershipIn, teamMembers } from '@/lib/b2b/team/utils';

export default function InboundLeads({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const { everyone } = useB2BReps(team);
  const [view, setView] = useState<View>('list');
  const [lens, setLens] = useState<Lens>('today');
  const [scopeChoice, setScopeChoice] = useState<'mine' | 'all' | null>(null);

  const [f, setF] = useState<InboundFilters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [listPage, setListPage] = useState(0);

  const [opened, setOpened] = useState<InboundLead | null>(null);
  const [move, setMove] = useState<{ lead: InboundLead; target: InboundStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const today = istToday();

  const inboundOwners = useMemo(() => {
    const members = teamMembers(team.members, 'inbound').map((m) => ({ id: m.kylasUserId as number, name: m.name }));
    return members.length ? members : B2B_INBOUND_OWNER_LIST;
  }, [team.members]);
  const ownerName = useMemo(() => new Map(inboundOwners.map((o) => [o.id, o.name])), [inboundOwners]);

  const me = membershipIn(viewer, 'inbound');
  const myKylasId = me?.kylasUserId ?? undefined;
  const unlinked = !viewer.isManager && !myKylasId;
  const scope = viewer.isManager ? scopeChoice ?? (myKylasId ? 'mine' : 'all') : 'mine';
  const leadOwners = useMemo(
    () => teamMembers(team.members, 'inbound').filter((m) => m.active && m.kylasUserId).map((m) => ({ id: m.kylasUserId as number, name: m.name })),
    [team.members],
  );
  const canAdd = viewer.isManager ? leadOwners.length > 0 : !!myKylasId;

  const ownerId = useMemo(
    () => (scope === 'mine'
      ? myKylasId
      : f.owner === 'all' ? undefined : inboundOwners.find((o) => o.name === f.owner)?.id),
    [scope, myKylasId, f.owner, inboundOwners],
  );
  const serverOpts = useMemo(() => ({
    ownerId, search: appliedSearch, createdFrom: f.createdFrom,
    createdTo: f.createdTo, kylasStage: f.kylasStage === 'all' ? undefined : Number(f.kylasStage),
  }), [ownerId, appliedSearch, f.createdFrom, f.createdTo, f.kylasStage]);
  const fetchKey = appliedSearch ? JSON.stringify(serverOpts) : '';
  const latestLoad = useRef(0);

  const load = (quiet = false) => {
    if (unlinked) {
      setLeads([]);
      setLoading(false);
      return;
    }
    const run = ++latestLoad.current;
    if (!quiet) {
      setError(null);
      setLoadFailed(false);
      setLoading(true);
    }
    fetchInboundBoard(appliedSearch ? serverOpts : {})
      .then((res) => {
        if (run !== latestLoad.current) return;
        if (!res.ok) throw new Error(appliedSearch
          ? 'Kylas did not answer the search, so leads not yet in the CRM may be missing from these results.'
          : 'The CRM database did not answer, so the board is missing leads. Nothing is counted until it loads.');
        setLeads(res.leads);
        setLoadFailed(false);
      })
      .catch((e) => {
        if (run !== latestLoad.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load leads');
        if (!quiet) setLoadFailed(true);
      })
      .finally(() => { if (run === latestLoad.current) setLoading(false); });
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { if (!team.loading) load(); }, [fetchKey, team.loading, unlinked]);

  const sync = useInboundSync(!team.loading, () => loadRef.current(true));

  const named = useMemo(() => leads.map((l) => {
    const n = l.ownerId != null ? ownerName.get(l.ownerId) : undefined;
    return n && n !== l.owner ? { ...l, owner: n } : l;
  }), [leads, ownerName]);

  const filtered = useMemo(
    () => named.filter((l) => inboundBoardMatches(l, { ...serverOpts, search: undefined }) && matchesFilters(l, f)).sort(byNewestLeadFirst),
    [named, f, serverOpts],
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

  const canReassign = viewer.isManager || !!me;
  const reassign = useInboundReassign({
    leads: named,
    members: team.members,
    onMoved: (moved) => {
      const byId = new Map(moved.map((l) => [l.id, l]));
      setLeads((prev) => prev.map((l) => byId.get(l.id) ?? l));
    },
  });
  const clearPicks = reassign.clear;

  useEffect(() => { setListPage(0); clearPicks(); }, [serverOpts, f, lens, clearPicks]);

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
    const res = await saveInboundLead(lead, updated);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? res.lead ?? lead : l)));
    if (!res.lead) setMoveError(`Could not move ${lead.companyName || lead.company}: ${res.error}`);
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

  const clearFilters = () => setF(NO_FILTERS);
  const activeFilters = activeFilterCount(f);

  const selected = opened ? named.find((l) => l.id === opened.id) ?? opened : null;
  const openLead = (id: string) => setOpened(named.find((l) => l.id === id) ?? null);
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
            {loading ? ' · loading…' : ` · ${filtered.length} lead${filtered.length === 1 ? '' : 's'}`}
            {sync.syncing && <span className="text-gray-400"> · checking Kylas for new leads…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {viewer.isManager && myKylasId && (
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
          {canAdd && (
            <button
              onClick={() => setAdding(true)}
              className="bg-white border border-gray-200 text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap"
            >
              + Add lead
            </button>
          )}
          <button
            onClick={sync.syncNow}
            disabled={sync.syncing}
            title="Brings in every inbound lead from Kylas that is not in the CRM yet. It never changes a lead that is already here."
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {sync.syncing ? '↻ Syncing…' : '↻ Sync from Kylas'}
          </button>
        </div>
      </div>

      {me && !myKylasId && (
        <p className="text-[12px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">
          You are on the inbound team but your Kylas user is not linked, so no lead can be yours yet. A B2B manager
          links it under <strong>Team</strong>.
        </p>
      )}
      {unlinked && !team.loading && (
        <p className="text-[12px] rounded px-3 py-2 mb-3 border bg-amber-50 border-amber-200 text-amber-800">
          {team.error
            ? `The B2B team list did not load (${team.error}), so your leads cannot be picked out and none are shown.`
            : 'You are not on the Inbound team with a linked Kylas user, so no leads are shown. A B2B manager can add you under B2B → Team.'}
        </p>
      )}
      {sync.note && (
        <p className={`text-[12px] rounded px-3 py-2 mb-3 border ${sync.note.tone === 'ok' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {sync.note.text}
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
      {reassign.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{reassign.error}</span>
          <button onClick={() => reassign.setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {reassign.note && (
        <p className="text-[12px] rounded px-3 py-2 mb-3 border bg-teal-50 border-teal-200 text-teal-800">{reassign.note}</p>
      )}
      {moveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {loading ? <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads…" /></div>
        : loadFailed ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
            <p className="text-[12px] text-gray-600">Leads did not load, so nothing here can be counted yet.</p>
            <button onClick={() => load()} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Try again</button>
          </div>
        ) : view === 'board' ? (
          <InboundBoard leads={filtered} today={today} scroll={kanbanScroll} onOpen={openLead} onMove={requestMove} />
        ) : (
          <>
          {canReassign && (
            <AssignBar
              count={reassign.selectedCount}
              noun="lead"
              teams={reassign.teams}
              busy={reassign.busy}
              rule={reassign.rule}
              onAssign={reassign.assign}
              onClear={reassign.clear}
            />
          )}
          <LeadTable
            lens={lens}
            rows={rows}
            today={today}
            showOwner={scope === 'all'}
            searchQuery={appliedSearch}
            valueText={valueText}
            page={listPage}
            setPage={setListPage}
            onOpen={openLead}
            onClearSearch={() => { setSearch(''); setAppliedSearch(''); }}
            emptyAction={emptyAction}
            picked={canReassign ? reassign.picked : undefined}
            onTogglePick={reassign.toggle}
            onTogglePage={reassign.togglePage}
          />
          </>
        )}

      {adding && (
        <AddLeadModal
          owners={leadOwners}
          defaultOwner={myKylasId ? { id: myKylasId, name: me?.name || viewer.name } : undefined}
          canPickOwner={viewer.isManager}
          loaded={leads}
          actorName={viewer.name}
          onCancel={() => setAdding(false)}
          onCreated={(lead) => { setLeads((prev) => [lead, ...prev]); setAdding(false); setOpened(lead); }}
          onOpenExisting={(lead) => {
            setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
            setAdding(false);
            setOpened(lead);
          }}
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
          key={selected.id}
          onClose={() => setOpened(null)}
          actorName={viewer.name}
          actorPhone={viewer.phone}
          members={teamMembers(team.members, 'inbound')}
          people={everyone}
          canReassign={canReassign}
          canCredit={viewer.isManager}
          onSaved={(updated) => {
            setOpened(updated);
            setLeads((prev) => (prev.some((l) => l.id === updated.id) ? prev.map((l) => (l.id === updated.id ? updated : l)) : [updated, ...prev]));
          }}
        />
      )}
    </div>
  );
}
