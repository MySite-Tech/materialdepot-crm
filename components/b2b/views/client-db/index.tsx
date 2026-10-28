'use client';

import { ACTIVE_WINDOW_MONTHS, CLIENT_ENTITY_TYPES, ClientEntity, ClientStatus, EVIDENCE_IS_EXACT, MergeChoices, SEGMENTS, clientStatus, contactLabel, contactNumbers, currentTemperature, daysToInactive, findDuplicates, gstNumbers, istToday, mergeClients, primaryContact } from '../../models/client';
import { newB2BId } from '../../models/ids';
import { KAMS, fmtShortINR } from '../../models/mock-data';
import { FirmDrawer } from '../../drawers/firm';
import { useClientAggregates } from '../../hooks/use-client-aggregates';
import { ExportFormat } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { StatTile, TemperatureChip } from '../../ui/client-chips';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { PAGE_SIZE } from './constants';
import { ClientModal } from './ui/client-modal';
import { MergeModal } from './ui/merge';
import { ClientTable } from './ui/table';
import { SeedModal } from './seed';
import { UploadModal } from './upload';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { clientFromSeed, deleteB2BRow, fetchClients, upsertClient } from '@/lib/b2b';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function ClientDatabase() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientEntity | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kamFilter, setKamFilter] = useState('all');

  const today = istToday();
  const { load: loadAggregates, addPhones, metricsFor, historyFor } = useClientAggregates();

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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return clients
      .map((client) => {
        const metrics = metricsFor(client);
        return { client, metrics, status: clientStatus(metrics, today), days: daysToInactive(metrics, today) };
      })
      .filter(({ client, status }) => {
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (segmentFilter !== 'all' && client.segment !== segmentFilter) return false;
        if (typeFilter !== 'all' && client.clientType !== typeFilter) return false;
        if (kamFilter !== 'all' && (client.kam || '') !== (kamFilter === 'unassigned' ? '' : kamFilter)) return false;
        if (!q) return true;
        return client.company.toLowerCase().includes(q)
          || (client.contacts || []).some((c) => (c.name || '').toLowerCase().includes(q))
          || (digits.length >= 4 && contactNumbers(client.contacts).some((p) => p.includes(digits)))
          || gstNumbers(client.gsts).some((g) => g.toLowerCase().includes(q));
      })
      .sort((a, b) =>
        String(b.metrics.lastOrderPlaced || '').localeCompare(String(a.metrics.lastOrderPlaced || ''))
        || a.client.company.localeCompare(b.client.company));
  }, [clients, metricsFor, search, statusFilter, segmentFilter, typeFilter, kamFilter, today]);

  useEffect(() => { setPage(1); }, [search, statusFilter, segmentFilter, typeFilter, kamFilter]);

  const totals = useMemo(() => {
    let active = 0, inactive = 0, unassigned = 0, revenue = 0, unread = 0;
    for (const r of rows) {
      if (r.status === 'Active') active++;
      else if (r.status === 'Inactive') inactive++;
      if (!r.client.kam) unassigned++;
      if (r.metrics.totalRevenue === undefined) unread++; else revenue += r.metrics.totalRevenue;
    }
    return { active, inactive, unassigned, revenue, unread };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const openRow = useMemo(() => {
    const client = clients.find((c) => c.id === openId);
    if (!client) return null;
    const metrics = metricsFor(client);
    return { client, metrics, status: clientStatus(metrics, today), days: daysToInactive(metrics, today), temp: currentTemperature(client.interactions) };
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

  const exportRows = (format: ExportFormat) => {
    const headers = [
      'Company Name', 'Contact Person', 'Primary Contact', 'All Contact Numbers', 'GST Numbers',
      'Segment', 'Client Type', 'Source', 'KAM', 'Client Status',
      'Last Order Placed', 'Number of Orders', 'Total Revenue', 'Average Order Value', 'Temperature', 'Remarks',
    ];
    const body = rows.map(({ client, metrics, status }) => {
      const primary = primaryContact(client.contacts);
      const temp = currentTemperature(client.interactions);
      return [
        client.company,
        contactLabel(primary),
        primary?.number || '',
        contactNumbers(client.contacts).join(' '),
        gstNumbers(client.gsts).join(' '),
        client.segment || '',
        client.clientType || '',
        client.source,
        client.kam || '',
        status,
        metrics.lastOrderPlaced || (metrics.dateState === 'unavailable' ? 'unread' : ''),
        metrics.orders ?? '',
        metrics.totalRevenue ?? '',
        metrics.averageOrderValue !== undefined ? Math.round(metrics.averageOrderValue) : '',
        temp ? temp.value : '',
        client.remarks || '',
      ];
    });
    setExporting(true);
    try {
      if (format === 'csv') exportRowsCsv(headers, body, `client-database-${todayStr()}`);
      else exportRowsExcel(headers, body, `client-database-${todayStr()}`, 'Clients');
    } finally {
      setExporting(false);
    }
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
          <ExportButton onExport={(f) => exportRows(f)} disabled={exporting} />
          <button onClick={() => setSeeding(true)} className={btnGhost}>Seed from leads</button>
          <button onClick={() => setUploading(true)} className={btnGhost}>Bulk Upload</button>
          <button onClick={() => setMerging(true)} className={btnGhost}>
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

      {!loading && !!clients.length && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <StatTile label="Firms" value={rows.length} sub={rows.length === clients.length ? 'all firms' : `of ${clients.length}, filtered`} />
          <StatTile label="Active" value={totals.active} tone="#15803D" sub={`ordered in the last ${ACTIVE_WINDOW_MONTHS} months`} />
          <StatTile label="Inactive" value={totals.inactive} tone={totals.inactive ? '#B45309' : undefined} />
          <StatTile label="No KAM" value={totals.unassigned} tone={totals.unassigned ? '#DC2626' : undefined} sub="need an owner" />
          <StatTile label="Lifetime revenue" value={fmtShortINR(totals.revenue)} sub={totals.unread ? `${totals.unread} firm${totals.unread === 1 ? '' : 's'} unread` : undefined} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, contact, number or GST…"
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] w-full sm:w-[280px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ClientStatus)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All statuses</option>
          {(['Active', 'Inactive', 'Unknown'] as ClientStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All segments</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All types</option>
          {CLIENT_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={kamFilter} onChange={(e) => setKamFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All KAMs</option>
          <option value="unassigned">Unassigned</option>
          {kamOptions.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

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
          {rows.length ? (
            <ClientTable rows={pageRows} onOpen={(c) => setOpenId(c.id)} />
          ) : (
            <p className="text-[12px] text-gray-400 py-10 text-center">No firm matches these filters.</p>
          )}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex-wrap">
            <span>{rows.length ? `Showing ${(curPage - 1) * PAGE_SIZE + 1}–${Math.min(curPage * PAGE_SIZE, rows.length)} of ${rows.length}` : `0 of ${clients.length}`}</span>
            {rows.length > PAGE_SIZE && (
              <div className="flex gap-2">
                <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
                <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3">
        {`Active means an order placed within the last ${ACTIVE_WINDOW_MONTHS} months, counted back from today`} (the PRD&apos;s
        “measured from Last Order Placed” would make every past buyer Active forever; flagged for KK).
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
