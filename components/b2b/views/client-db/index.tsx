'use client';

import { ACTIVE_DAYS, ClientEntity, EVIDENCE_IS_EXACT, INACTIVE_DAYS, MergeChoices, clientMatchesSearch, clientStatus, contactNumbers, currentTemperature, daysToLapse, findDuplicates, istToday, mergeClients } from '../../models/client';
import { newB2BId } from '../../models/ids';
import { KAMS, fmtShortINR } from '../../models/mock-data';
import { FirmDrawer } from '../../drawers/firm';
import { useB2BReps } from '../../hooks/use-b2b-reps';
import { useClientAggregates } from '../../hooks/use-client-aggregates';
import { useStudioLogins } from '../../hooks/use-studio-logins';
import { AssignBar } from '../../ui/assign-bar';
import { useFirmAssign } from './hooks/use-firm-assign';
import { TemperatureChip } from '../../ui/client-chips';
import { LensTileGroup, LensTiles } from '../../ui/lens-tiles';
import { CLIENT_LENS, LENS_DEFAULT_SORT, NO_FILTERS, PAGE_SIZE, STATUS_LENSES } from './constants';
import { ClientFilters, ClientLens, ClientListRow, SortState } from './types';
import { clientLensMatches, filterChips, matchesFilters, sortRows } from './utils';
import { ClientFilterBar, ListHead } from './ui/filters';
import { ClientModal } from './ui/modals/client-modal';
import { MergeModal } from './ui/modals/merge';
import { SeedModal } from './ui/modals/seed';
import { UploadModal } from './ui/modals/upload';
import { ClientTable } from './ui/table';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { clientFromSeed, deleteB2BRow, fetchClients, upsertClient } from '@/lib/b2b';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function ClientDatabase({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientEntity | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [f, setF] = useState<ClientFilters>(NO_FILTERS);
  const [lens, setLens] = useState<ClientLens>('all');
  const [sortPick, setSortPick] = useState<SortState | null>(null);

  const today = istToday();
  const { kams } = useB2BReps(team);
  const assigner = useFirmAssign(clients, kams, viewer.member?.name || viewer.name, (list) => {
    const byId = new Map(list.map((c) => [c.id, c]));
    setClients((prev) => prev.map((c) => byId.get(c.id) ?? c));
  });
  const { load: loadAggregates, addPhones, metricsFor, historyFor } = useClientAggregates();
  const studio = useStudioLogins();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchClients();
      setClients(list);
      await loadAggregates(list.flatMap((c) => contactNumbers(c.contacts)));
    } catch (e) {
      console.error('[b2b] client database load failed', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadAggregates]);

  useEffect(() => { load(); }, [load]);

  const suggestions = useMemo(() => findDuplicates(clients), [clients]);

  const scoped = useMemo<ClientListRow[]>(() =>
    clients
      .filter((c) => matchesFilters(c, f) && clientMatchesSearch(c, search))
      .map((client) => {
        const metrics = metricsFor(client);
        return { client, metrics, status: clientStatus(metrics, today), days: daysToLapse(metrics, today) };
      }),
  [clients, metricsFor, f, search, today]);

  const byLens = useMemo(() => {
    const out = Object.fromEntries((Object.keys(CLIENT_LENS) as ClientLens[]).map((k) => [k, [] as ClientListRow[]])) as Record<ClientLens, ClientListRow[]>;
    for (const r of scoped) for (const k of Object.keys(out) as ClientLens[]) if (clientLensMatches(k, r)) out[k].push(r);
    return out;
  }, [scoped]);

  const sort = sortPick || LENS_DEFAULT_SORT[lens];
  const rows = useMemo(() => sortRows(byLens[lens], sort), [byLens, lens, sort]);

  useEffect(() => { setPage(1); }, [search, f, lens, sort]);

  const sumRevenue = (list: ClientListRow[]) => list.reduce((n, r) => n + (r.metrics.totalRevenue || 0), 0);
  const listRevenue = useMemo(() => sumRevenue(rows), [rows]);
  const scopeRevenue = useMemo(() => sumRevenue(scoped), [scoped]);

  const pickLens = (k: ClientLens) => { setLens(k); setSortPick(null); };
  const clearAll = () => { setSearch(''); setF(NO_FILTERS); pickLens('all'); };
  const filtersSet = !!search.trim() || filterChips(f).length > 0;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const unread = byLens.unknown.length;
  const neverOrdered = byLens.inactive.filter((r) => r.metrics.dateState === 'no-orders').length;
  const tileValue = (k: ClientLens): { value: string; sub?: string; warn?: boolean } => {
    if (loading) return { value: '…', sub: 'loading' };
    if (loadError) return { value: 'Unknown', sub: 'did not load', warn: true };
    const n = byLens[k].length;
    switch (k) {
      case 'all':      return { value: String(n), sub: `${fmtShortINR(scopeRevenue)} lifetime${unread ? ` · ${unread} unread` : ''}`, warn: !!unread };
      case 'active':   return { value: String(n), sub: `ordered in last ${ACTIVE_DAYS} days` };
      case 'lapsing':  return { value: String(n), sub: `last order ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago` };
      case 'inactive': return { value: String(n), sub: neverOrdered ? `${neverOrdered} never ordered` : `no order in ${INACTIVE_DAYS} days` };
      case 'unknown':  return { value: String(n), sub: 'orders did not load', warn: true };
      case 'nokam':    return { value: String(n), sub: n ? 'need an owner' : 'all owned', warn: n > 0 };
      case 'pending':  return { value: String(n), sub: 'not accepted yet' };
    }
  };
  const tile = (k: ClientLens) => ({
    key: k, title: CLIENT_LENS[k].title, rule: CLIENT_LENS[k].rule, accent: CLIENT_LENS[k].accent,
    ...tileValue(k), muted: !loading && !loadError && byLens[k].length === 0 && k !== 'all',
  });
  const tileGroups: LensTileGroup<ClientLens>[] = [
    { title: 'Firms by order activity', tiles: STATUS_LENSES.map(tile) },
    { title: 'Needs attention', tiles: (['nokam', ...(byLens.pending.length ? ['pending'] : []), ...(unread ? ['unknown'] : [])] as ClientLens[]).map(tile) },
  ];

  const openRow = useMemo(() => {
    const client = clients.find((c) => c.id === openId);
    if (!client) return null;
    const metrics = metricsFor(client);
    return { client, metrics, status: clientStatus(metrics, today), days: daysToLapse(metrics, today), temp: currentTemperature(client.interactions) };
  }, [clients, openId, metricsFor, today]);

  const kamOptions = useMemo(() => {
    const seen = new Set<string>(KAMS);
    clients.forEach((c) => c.kam && seen.add(c.kam));
    return [...seen].sort();
  }, [clients]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
    addPhones(contactNumbers(c.contacts));
    return null;
  };

  const runMerge = async (sources: ClientEntity[], choices: MergeChoices): Promise<string | null> => {
    const { merged, absorbed } = mergeClients(sources, choices, undefined);

    const writeError = await upsertClient(merged);
    if (writeError) return `The merged client could not be saved, so nothing was deleted: ${writeError}`;

    const deleteErrors: string[] = [];
    const deleted: string[] = [];
    for (const c of absorbed) {
      const err = await deleteB2BRow(c.id);
      if (err) deleteErrors.push(`${c.company}: ${err}`); else deleted.push(c.id);
    }

    setClients((prev) => {
      const gone = new Set(deleted);
      const next = prev.filter((c) => !gone.has(c.id));
      return next.some((c) => c.id === merged.id)
        ? next.map((c) => (c.id === merged.id ? merged : c))
        : [merged, ...next];
    });

    load();

    return deleteErrors.length
      ? `Merged, but ${deleteErrors.length} old record(s) could not be deleted and will still show as duplicates: ${deleteErrors.join('; ')}`
      : null;
  };

  const blank = (): ClientEntity => ({
    id: newB2BId('CLI'),
    company: '',
    contacts: [{ number: '', primary: true }],
    gsts: [],
    source: 'Existing',
    interactions: [],
    escalations: [],
    createdAt: new Date().toISOString(),
  });

  const exactSuggestions = suggestions.filter((s) => s.evidence.some((e) => EVIDENCE_IS_EXACT[e]));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Client Database</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Every firm we sell to, its numbers and GSTINs, and the orders placed on them
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSeeding(true)} className={btnGhost}>Seed from leads</button>
          <button onClick={() => setUploading(true)} className={btnGhost}>Bulk Upload</button>
          <button
            onClick={() => setMerging(true)}
            className={btnGhost}
            title={exactSuggestions.length ? `${exactSuggestions.length} pair${exactSuggestions.length === 1 ? '' : 's'} of firms share a number, GST or PAN and are probably one business` : 'Find and merge duplicate firms'}
          >
            Merge
            {!!exactSuggestions.length && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">{exactSuggestions.length}</span>}
          </button>
          <button onClick={() => setAddingNew(true)} className={btnPrimary}>+ Add Client</button>
        </div>
      </div>

      {loadError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          Could not load the Client Database: {loadError}.{' '}
          <button onClick={load} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {(loading || !!clients.length) && <LensTiles groups={tileGroups} active={lens} onPick={pickLens} />}

      {!!clients.length && (
        <ClientFilterBar
          f={f}
          set={(patch) => setF((p) => ({ ...p, ...patch }))}
          search={search}
          setSearch={setSearch}
          kamOptions={kamOptions}
          onClear={clearAll}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading clients…</p>
      ) : !clients.length ? (
        <div className="bg-white rounded-lg border border-gray-200 py-12 px-6 text-center">
          <p className="text-[13px] font-semibold text-gray-600">The Client Database is empty.</p>
          <p className="text-[12px] text-gray-400 mt-1 max-w-[520px] mx-auto">
            Seed it from the closed Inbound / Outreach leads and the KAM board, upload the §7 template, or add a
            client by hand. Nothing about this list is guessed: a client exists once somebody says it does.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setSeeding(true)} className={btnPrimary}>Seed from leads</button>
            <button onClick={() => setUploading(true)} className={btnGhost}>Bulk Upload</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ListHead
            lens={lens}
            shown={rows.length}
            total={clients.length}
            revenue={listRevenue}
            unread={rows.filter((r) => r.status === 'Unknown').length}
            f={f}
            search={search}
            onLens={pickLens}
            onFilter={(k) => setF((p) => ({ ...p, [k]: NO_FILTERS[k] }))}
            onSearch={() => setSearch('')}
            onClearAll={clearAll}
          />
          {viewer.isManager && (
            <AssignBar
              count={assigner.picked.size}
              noun="firm"
              reps={kams}
              busy={assigner.busy}
              rule="Round robin gives each firm to the active, in-rotation KAM holding the fewest firms. The KAM must accept or reject it."
              onAssign={assigner.assign}
              onClear={assigner.clear}
            />
          )}
          {assigner.error && (
            <div className="px-4 py-2 text-[12px] text-red-700 bg-red-50 border-b border-red-100 flex items-start justify-between gap-3">
              <span>{assigner.error}</span>
              <button onClick={() => assigner.setError(null)} className="opacity-60 hover:opacity-100 leading-none">×</button>
            </div>
          )}
          {rows.length ? (
            <ClientTable
              rows={pageRows}
              today={today}
              studio={studio}
              sort={sort}
              onSort={setSortPick}
              onOpen={(c) => setOpenId(c.id)}
              picked={viewer.isManager ? assigner.picked : undefined}
              onPick={assigner.toggle}
              onPickPage={() => assigner.togglePage(pageRows.map((r) => r.client.id))}
            />
          ) : (
            <div className="py-12 px-6 text-center">
              <p className="text-[13px] font-semibold text-gray-600">
                {filtersSet ? `No firm in ${CLIENT_LENS[lens].heading} matches the search and filters.` : CLIENT_LENS[lens].empty}
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {filtersSet && <button onClick={() => { setSearch(''); setF(NO_FILTERS); }} className={btnGhost}>Clear search and filters</button>}
                {lens !== 'all' && <button onClick={() => pickLens('all')} className={btnGhost}>Show all firms</button>}
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex-wrap">
              <span>Showing {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} of {rows.length}</span>
              {rows.length > PAGE_SIZE && (
                <div className="flex gap-2">
                  <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
                  <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3">
        {`Active means an order placed in the last ${ACTIVE_DAYS} days, Inactive 1 month ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago, Inactive anything older, counted back from today. The KAM tab uses the same rule.`}
      </p>

      {addingNew && (
        <ClientModal client={blank()} isNew onClose={() => setAddingNew(false)} onSave={saveClient} />
      )}
      {openRow && (
        <FirmDrawer
          client={openRow.client}
          clients={clients}
          metrics={openRow.metrics}
          status={openRow.status}
          days={openRow.days}
          historyFor={historyFor}
          badges={openRow.temp && <TemperatureChip value={openRow.temp.value} at={openRow.temp.at} />}
          reassignReason="Reassigned in the Client Database"
          assignAs={viewer.isManager ? viewer.member?.name || viewer.name : undefined}
          onClose={() => setOpenId(null)}
          onSave={saveClient}
          onEdit={() => setEditing(openRow.client)}
        />
      )}
      {editing && (
        <ClientModal client={editing} onClose={() => setEditing(null)} onSave={saveClient} />
      )}
      {merging && (
        <MergeModal clients={clients} suggestions={suggestions} onClose={() => setMerging(false)} onMerge={runMerge} />
      )}
      {uploading && (
        <UploadModal
          existing={clients}
          onClose={() => setUploading(false)}
          onImport={async (result) => {
            const errors: Record<string, string> = {};
            const saved: ClientEntity[] = [];
            for (const e of result.entities) {
              if (!e.client || e.saveError) continue;
              const err = await upsertClient(e.client);
              if (err) errors[e.client.id] = err; else saved.push(e.client);
            }
            if (saved.length) {
              setClients((prev) => {
                const ids = new Set(saved.map((c) => c.id));
                return [...saved, ...prev.filter((c) => !ids.has(c.id))];
              });
              load();
            }
            return errors;
          }}
        />
      )}
      {seeding && (
        <SeedModal
          onClose={() => { setSeeding(false); load(); }}
          onSeed={async (plan) => {
            const errors: string[] = [];
            let saved = 0;
            for (const cand of plan.create) {
              const client = clientFromSeed(cand);
              const err = await upsertClient(client);
              if (err) errors.push(`${cand.company}: ${err}`); else saved++;
            }
            return { saved, errors };
          }}
        />
      )}
    </div>
  );
}
