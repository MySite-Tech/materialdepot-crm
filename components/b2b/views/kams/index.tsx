'use client';

import { KamClientsView } from './panels/clients';
import { KamOrdersView } from './orders';

import { ClientEntity, ClientOrderMetrics, ClientStatus, contactNumbers, istToday, primaryContact } from '../../models/client';
import { applyAdvance, planAdvances } from '../../models/kam/auto-stage';
import { AssignedClientRow, DAILY_CALL_TARGET, KAM_OPEN_STATUSES, KAM_VIEWS, KamOrder, KamOrderStatus, KamView, assignedClientRows, callsLoggedOn, followUpQueue, isLegacyKamStage, kamPipeline, todaysCalls } from '../../models/kam';
import { KAMS, fmtL } from '../../models/mock-data';
import { useDragAutoScroll } from '../../hooks/use-drag-auto-scroll';
import { ExportFormat } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { ClientDrawer } from './drawer';
import { CadenceList, InteractionModal } from './panels/interactions';
import { OrderModal } from './orders/modal';
import { StatTile } from './ui';
import { UploadModal } from './upload';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { ClientOrderHistory, clientMetricsFrom, fetchB2BBulk, fetchClients, fetchKamOrders, kamEnquiryIdsToResolve, orderDatesFromAggregates, resolveKamOrders, upsertClient, upsertKamOrder } from '@/lib/b2b';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function KAMs() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [orders, setOrders] = useState<KamOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<Record<string, ClientOrderHistory>>({});
  const [dates, setDates] = useState<{ byPhone: Record<string, { last?: string; loaded: boolean }> } | null>(null);
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
    const { histories: agg, deals, ok: aggOk } = await fetchB2BBulk(phones, kamEnquiryIdsToResolve(ord));
    setAggregates(agg);
    setDates(orderDatesFromAggregates(agg, phones, aggOk));
    setLoading(false);

    if (!ord.length) return;
    const { resolutions, overflow } = await resolveKamOrders(ord, deals);
    const resolvedById = new Map(resolutions.filter((r) => r.resolved).map((r) => [r.order.id, r.resolved!]));
    const afterResolve = ord.map((o) => resolvedById.get(o.id) ?? o);

    const advances = planAdvances(afterResolve);
    const advanced = advances.map(applyAdvance);
    const advancedById = new Map(advanced.map((o) => [o.id, o]));
    const finalOrders = afterResolve.map((o) => advancedById.get(o.id) ?? o);

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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
        <StatTile label="Assigned clients" value={rows.length} sub={`${rows.filter((r) => r.status === 'Active').length} active`} />
        <StatTile label="Calls today" value={`${callsToday}/${callTarget}`} tone={callsToday >= callTarget ? '#15803D' : '#B45309'} sub="§4.1 target, reported not enforced" />
        <StatTile label="Due today" value={today_.length} tone={today_.length ? '#EA580C' : undefined} />
        <StatTile label="Overdue" value={queue.length} tone={queue.length ? '#DC2626' : undefined} />
        <StatTile label="Pipeline" value={fmtL(pipeline.pipeline)} sub={pipeline.estimatedPipeline ? `${fmtL(pipeline.estimatedPipeline)} estimated` : `${pipeline.count} open`} />
        <StatTile label="Open orders" value={scopedOrders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length} />
      </div>

      {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>}

      {!loading && view === 'clients' && (
        <KamClientsView
        clients={clients}
        filteredRows={filteredRows}
        search={search}
        setDrawerId={setDrawerId}
        setSearch={setSearch}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />
      )}

      {!loading && view === 'today' && (
        <CadenceList rows={today_} kind="today" onOpen={setDrawerId}
          emptyNote="Nothing is due today. A client appears here when the follow-up date on its latest interaction is today." />
      )}

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

      {!loading && view === 'orders' && (
        <KamOrdersView
        boardScroll={boardScroll}
        legacyCount={legacyCount}
        orderStatusFilter={orderStatusFilter}
        scopedOrders={scopedOrders}
        setOrderModal={setOrderModal}
        setOrderStatusFilter={setOrderStatusFilter}
        sync={sync}
        unlinkedOrders={unlinkedOrders}
      />
      )}

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
