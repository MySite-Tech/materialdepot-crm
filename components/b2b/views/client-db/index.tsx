'use client';

import { ACTIVE_WINDOW_MONTHS, CLIENT_ENTITY_TYPES, ClientEntity, ClientOrderMetrics, ClientStatus, EVIDENCE_IS_EXACT, MergeChoices, SEGMENTS, clientStatus, contactLabel, contactNumbers, currentTemperature, daysToInactive, findDuplicates, gstNumbers, istToday, mergeClients, primaryContact, temperatureColor, validateGst } from '../../models/client';
import { KAMS, fmtL } from '../../models/mock-data';
import { ExportFormat } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { ClientModal } from './ui/client-modal';
import { MergeModal } from './ui/merge';
import { OrderDetailsTable } from './ui/rows';
import { SeedModal } from './seed';
import { Metric, StatusPill } from './ui';
import { UploadModal } from './upload';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { ClientOrderDetails, ClientOrderHistory, clientFromSeed, clientMetricsFrom, deleteB2BRow, fetchB2BBulk, fetchClientOrderRows, fetchClients, invalidateClientTickets, orderDatesFromAggregates, upsertClient } from '@/lib/b2b';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

export default function ClientDatabase() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<{ byPhone: Record<string, { last?: string; loaded: boolean }> } | null>(null);
  const [detailsByClient, setDetailsByClient] = useState<Record<string, ClientOrderDetails>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientEntity | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kamFilter, setKamFilter] = useState('all');

  const today = istToday();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchClients();
      setClients(list);

      const phones = list.flatMap((c) => contactNumbers(c.contacts));
      const { histories: agg, ok: aggOk } = await fetchB2BBulk(phones, []);
      setAggregates(agg);
      setDates(orderDatesFromAggregates(agg, phones, aggOk));
    } catch (e) {
      console.error('[b2b] client database load failed', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metricsFor = useCallback(
    (c: ClientEntity): ClientOrderMetrics => clientMetricsFrom(c.contacts, aggregates, dates || undefined),
    [aggregates, dates],
  );

  const loadDetails = useCallback(async (c: ClientEntity, force = false) => {
    const phones = contactNumbers(c.contacts);
    if (!phones.length) return;
    if (force) invalidateClientTickets(phones);
    setDetailLoading((s) => ({ ...s, [c.id]: true }));
    try {
      const details = await fetchClientOrderRows(phones);
      setDetailsByClient((s) => ({ ...s, [c.id]: details }));
    } finally {
      setDetailLoading((s) => ({ ...s, [c.id]: false }));
    }
  }, []);

  const toggleExpand = (c: ClientEntity) => {
    if (expanded === c.id) { setExpanded(null); return; }
    setExpanded(c.id);
    if (!detailsByClient[c.id]) loadDetails(c);
  };

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

  const kamOptions = useMemo(() => {
    const seen = new Set<string>(KAMS);
    clients.forEach((c) => c.kam && seen.add(c.kam));
    return [...seen].sort();
  }, [clients]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
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
    id: `CLI-${Date.now()}`,
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
            One row per business entity · order metrics derived from the deal tickets, never stored
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
        <span className="text-[11px] text-gray-400 ml-auto">{rows.length} of {clients.length}</span>
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
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[1040px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                  <th className="text-left font-semibold px-3 py-2">Company</th>
                  <th className="text-left font-semibold px-3 py-2">Contact person</th>
                  <th className="text-left font-semibold px-3 py-2">Contact number</th>
                  <th className="text-left font-semibold px-3 py-2">Last order</th>
                  <th className="text-right font-semibold px-3 py-2">Orders</th>
                  <th className="text-right font-semibold px-3 py-2">Total revenue</th>
                  <th className="text-right font-semibold px-3 py-2">Avg order</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                  <th className="text-left font-semibold px-3 py-2">Seg</th>
                  <th className="text-left font-semibold px-3 py-2">KAM</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, metrics, status, days }) => {
                  const primary = primaryContact(client.contacts);
                  const isOpen = expanded === client.id;
                  const temp = currentTemperature(client.interactions);
                  const numbers = contactNumbers(client.contacts);
                  return (
                    <Fragment key={client.id}>
                      <tr
                        onClick={() => toggleExpand(client)}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-gray-50' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-300 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                            <span className="font-semibold text-gray-800">{client.company || <span className="text-gray-300">(unnamed)</span>}</span>
                            {temp && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                                style={{ background: temperatureColor(temp.value) + '1A', color: temperatureColor(temp.value) }}
                                title={`Account temperature ${temp.value}/10, scored ${temp.at}`}
                              >
                                {temp.value}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {client.source}
                            {client.clientType && ` · ${client.clientType}`}
                            {numbers.length > 1 && ` · ${numbers.length} numbers`}
                            {!!gstNumbers(client.gsts).length && ` · ${gstNumbers(client.gsts).length} GST`}
                            {!!(client.mergedFrom || []).length && ` · merged ×${(client.mergedFrom || []).length}`}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{contactLabel(primary) || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{primary?.number || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap"><Metric value={metrics.lastOrderPlaced} state={metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700"><Metric value={metrics.orders} state={metrics.dateState} /></td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap"><Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600 whitespace-nowrap"><Metric value={metrics.averageOrderValue} state={metrics.dateState} format={fmtL} /></td>
                        <td className="px-3 py-2"><StatusPill status={status} days={days} /></td>
                        <td className="px-3 py-2 text-gray-600">{client.segment || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{client.kam || <span className="text-gray-300">unassigned</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditing(client); }}
                            className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={11} className="px-3 pb-4 pt-1">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                              <div className="bg-white rounded-md border border-gray-200 p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Business entity · §3.1</div>
                                <div className="text-[13px] font-semibold text-gray-800">{client.company}</div>
                                <div className="text-[11px] text-gray-400 mb-2">
                                  {client.clientType || 'type not set'} · Segment {client.segment || '—'} · {client.source}
                                </div>

                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">Contact numbers</div>
                                {(client.contacts || []).map((c) => (
                                  <div key={c.number} className="text-[11px] text-gray-600">
                                    <span className="font-mono">{c.number}</span>
                                    {contactLabel(c) && <span className="text-gray-400"> · {contactLabel(c)}</span>}
                                    {c.primary && <span className="ml-1 text-[9px] font-bold text-[#0F766E]">PRIMARY</span>}
                                  </div>
                                ))}

                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">GST numbers</div>
                                {!(client.gsts || []).length ? (
                                  <p className="text-[11px] text-gray-300">None on file.</p>
                                ) : (
                                  (client.gsts || []).map((g) => {
                                    const v = validateGst(g.number);
                                    return (
                                      <div key={g.number} className="text-[11px] text-gray-600">
                                        <span className="font-mono">{g.number}</span>
                                        {v.stateName && <span className="text-gray-400"> · {v.stateName}</span>}
                                        {v.check === 'bad-checksum' && <span className="text-amber-600"> · check digit disagrees</span>}
                                        <div className="text-[10px] text-gray-400">
                                          {g.registeredName
                                            ? `Registered as ${g.registeredName}`
                                            : 'Registered company name unavailable — no GST Validator in this stack'}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}

                                {client.remarks && (
                                  <>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">Remarks</div>
                                    <p className="text-[11px] text-gray-600 break-words">{client.remarks}</p>
                                  </>
                                )}
                              </div>

                              <div className="bg-white rounded-md border border-gray-200 p-3 lg:col-span-2">
                                <OrderDetailsTable
                                  rows={detailsByClient[client.id]?.rows || []}
                                  failedPhones={detailsByClient[client.id]?.failedPhones || []}
                                  rejected={detailsByClient[client.id]?.rejected || 0}
                                  loading={!!detailLoading[client.id]}
                                  onRecheck={() => loadDetails(client, true)}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3">
        {`Client status is system-computed: Active means an ordered deal ticket within the last ${ACTIVE_WINDOW_MONTHS} months.`}{' '}
        The PRD says the window is measured “from Last Order Placed”, which read literally would make every client who
        ever ordered permanently Active — so it is anchored to today, which is the only reading under which the PRD&apos;s
        own “re-evaluates on daily rollover” does anything. Flagged for KK.
      </p>

      {addingNew && (
        <ClientModal client={blank()} isNew onClose={() => setAddingNew(false)} onSave={saveClient} />
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
