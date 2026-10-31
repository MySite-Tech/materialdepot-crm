'use client';

import { KamFirmTable } from './panels/clients';
import { KamSignoffTable } from './panels/signoff';
import { KamOrdersView } from './orders';
import { KamOrderTable } from './orders/table';

import { ACTIVE_DAYS, CLIENT_SOURCES, ClientEntity, INACTIVE_DAYS, InteractionType, contactNumbers, istToday, openCheckIn, primaryContact, withInteraction } from '../../models/client';
import { applyAdvance, planAdvances } from '../../models/kam/auto-stage';
import { AssignedClientRow, DAILY_CALL_TARGET, KAM_FIRM_LENSES, KAM_LENS, KAM_LENS_GROUPS, KAM_OPEN_STATUSES, KAM_SIDE_LENSES, KamFirmLens, KamLens, KamOrder, KamOrderLens, KamOrderStatus, SEGMENTS, assignedClientRows, canRespondToFirm, firmHandoverState, firmLensMatches, isLegacyKamStage, kamPipeline, orderLensMatches, acceptFirmHandover, sortFirmsForLens } from '../../models/kam';
import { newB2BId } from '../../models/ids';
import { fmtL } from '../../models/mock-data';
import { repNames, sameRep } from '../../models/outreach/handover';
import { useClientAggregates } from '../../hooks/use-client-aggregates';
import { useDragAutoScroll } from '../../hooks/use-drag-auto-scroll';
import { ClientDrawer } from './drawer';
import { InteractionModal } from './panels/interactions';
import { OrderModal } from './orders/modal';
import { LensPills, LensTileGroup, LensTiles } from '../../ui/lens-tiles';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { fetchClients, fetchKamOrders, kamEnquiryIdsToResolve, resolveKamOrders, upsertClient, upsertKamOrder } from '@/lib/b2b';
import { HANDOVER_TAT_HOURS } from '../../models/outreach/handover';
import { istDay } from '../../models/outreach/reminders';
import { CheckInCapture } from '../../ui/check-in-capture';
import { useB2BReps } from '../../hooks/use-b2b-reps';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function KAMs({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [orders, setOrders] = useState<KamOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);
  const [sync, setSync] = useState<{
    matched: number; noMatch: number; unavailable: number; overflow: number;
    advanced: number; writeErrors: string[];
  } | null>(null);

  const [lens, setLens] = useState<KamLens>('assigned');
  const [listPage, setListPage] = useState(0);
  const [kamFilter, setKamFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('all');
  const [source, setSource] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | KamOrderStatus>('all');

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [loggingFor, setLoggingFor] = useState<{ id: string; type: InteractionType } | null>(null);
  const [checkingInFor, setCheckingInFor] = useState<string | null>(null);
  const [orderModal, setOrderModal] = useState<{ order: KamOrder; isNew: boolean } | null>(null);

  const today = istToday();
  const { live, allKams } = useB2BReps(team);
  const me = useMemo(() => ({ name: viewer.member?.name || viewer.name, phone: viewer.phone }), [viewer.member, viewer.name, viewer.phone]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const boardScroll = useDragAutoScroll<HTMLDivElement>();
  const { load: loadAggregates, addPhones, metricsFor, historyFor } = useClientAggregates();

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
    const { deals } = await loadAggregates(phones, kamEnquiryIdsToResolve(ord));
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
  }, [loadAggregates]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNowMs(Date.now()); }, [clients]);

  const kamOptions = useMemo(() => {
    return repNames(allKams, [...clients.map((c) => c.kam), ...orders.map((o) => o.kam)]);
  }, [allKams, clients, orders]);

  const scopedClients = useMemo(
    () => (kamFilter === 'all' ? clients : clients.filter((c) => (kamFilter === 'unassigned' ? !c.kam : sameRep(c.kam, kamFilter)))),
    [clients, kamFilter],
  );
  const scopedOrders = useMemo(
    () => (kamFilter === 'all' ? orders : orders.filter((o) => sameRep(o.kam, kamFilter))),
    [orders, kamFilter],
  );

  const openOrderCount = useMemo(
    () => orders.filter((o) => KAM_OPEN_STATUSES.includes(o.status)).length,
    [orders],
  );

  const rows = useMemo(() => assignedClientRows(scopedClients, metricsFor, today), [scopedClients, metricsFor, today]);

  const q = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      if (segment !== 'all' && r.segment !== segment) return false;
      if (source !== 'all' && r.source !== source) return false;
      if (!q) return true;
      return r.company.toLowerCase().includes(q)
        || r.contactPerson.toLowerCase().includes(q)
        || (digits.length >= 4 && contactNumbers(r.client.contacts).some((p) => p.includes(digits)));
    });
  }, [rows, q, segment, source]);

  const filteredOrders = useMemo(
    () => (q ? scopedOrders.filter((o) => [o.company, o.enqId, o.requirement].some((v) => String(v || '').toLowerCase().includes(q))) : scopedOrders),
    [scopedOrders, q],
  );

  const firmsBy = useMemo(() => {
    const out = Object.fromEntries(KAM_FIRM_LENSES.map((k) => [k, [] as AssignedClientRow[]])) as Record<KamFirmLens, AssignedClientRow[]>;
    for (const r of filteredRows) for (const k of KAM_FIRM_LENSES) if (firmLensMatches(k, r, today)) out[k].push(r);
    return out;
  }, [filteredRows, today]);

  const ordersBy = useMemo(() => ({
    open: filteredOrders.filter((o) => orderLensMatches('open', o)),
    pipeline: filteredOrders.filter((o) => orderLensMatches('pipeline', o)),
    orders: filteredOrders,
  }), [filteredOrders]);

  const pipeline = useMemo(() => kamPipeline(ordersBy.pipeline), [ordersBy.pipeline]);
  const isOrderLens = (k: KamLens): k is KamOrderLens => k in ordersBy;
  const countOf = (k: KamLens) => (isOrderLens(k) ? ordersBy[k].length : firmsBy[k].length);

  const callTarget = kamFilter === 'all'
    ? repNames([], clients.map((c) => c.kam)).length * DAILY_CALL_TARGET
    : DAILY_CALL_TARGET;

  const firmRows = useMemo(
    () => (isOrderLens(lens) ? [] : sortFirmsForLens(lens, firmsBy[lens], today)),
    [lens, firmsBy, today],
  );

  useEffect(() => { setListPage(0); }, [lens, kamFilter, q, segment, source]);

  const clientsFailed = failed.includes('the client master');
  const ordersFailed = failed.includes('the order list');
  const unread = firmsBy.assigned.filter((r) => r.status === 'Unknown').length;

  const lateSignoffs = firmsBy.signoff.filter((r) => firmHandoverState(r.client, nowMs) === 'overdue').length;
  const tileValue = (k: KamLens): { value: string; sub?: string; warn?: boolean } => {
    if (loading) return { value: '…', sub: 'loading' };
    if (isOrderLens(k) ? ordersFailed : clientsFailed) return { value: 'Unknown', sub: 'did not load', warn: true };
    const n = countOf(k);
    switch (k) {
      case 'signoff':  return { value: String(n), sub: lateSignoffs ? `${lateSignoffs} past ${HANDOVER_TAT_HOURS}h` : 'to accept', warn: lateSignoffs > 0 };
      case 'called':   return { value: `${n}/${callTarget}`, sub: n >= callTarget ? 'target met' : `${callTarget - n} to go` };
      case 'overdue':  return { value: String(n), sub: 'date passed' };
      case 'due':      return { value: String(n), sub: 'for today' };
      case 'nofollow': return { value: String(n), sub: 'none booked' };
      case 'assigned': return { value: String(n), sub: unread ? `${unread} status unknown` : 'firms in scope', warn: !!unread };
      case 'active':   return { value: String(n), sub: unread ? `${unread} status unknown` : `last ${ACTIVE_DAYS} days`, warn: !!unread };
      case 'lapsing':  return { value: String(n), sub: `${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago` };
      case 'inactive': return { value: String(n), sub: `over ${INACTIVE_DAYS} days ago` };
      case 'never':    return { value: String(n), sub: 'no order on record' };
      case 'pipeline': return { value: fmtL(pipeline.pipeline), sub: pipeline.estimatedPipeline ? `${fmtL(pipeline.estimatedPipeline)} est.` : `${n} at Quote/PI` };
      default:         return { value: String(n), sub: 'not closed' };
    }
  };

  const tileGroups: LensTileGroup<KamLens>[] = KAM_LENS_GROUPS.map((g) => ({
    title: g.title,
    tiles: g.lenses.map((k) => ({
      key: k, title: KAM_LENS[k].title, rule: KAM_LENS[k].rule, accent: KAM_LENS[k].accent,
      ...tileValue(k), muted: !loading && countOf(k) === 0 && k !== 'pipeline',
    })),
  }));

  const pickLens = (k: KamLens) => setLens(k);

  const legacyCount = useMemo(() => orders.filter((o) => isLegacyKamStage(o.legacyStage)).length, [orders]);
  const unlinkedOrders = useMemo(() => orders.filter((o) => !o.clientId).length, [orders]);

  const drawerRow = useMemo(() => rows.find((r) => r.client.id === drawerId) || null, [rows, drawerId]);
  const loggingClient = useMemo(() => clients.find((c) => c.id === loggingFor?.id) || null, [clients, loggingFor]);
  const checkingInClient = useMemo(() => clients.find((c) => c.id === checkingInFor) || null, [clients, checkingInFor]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    addPhones(contactNumbers(c.contacts));
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
      id: newB2BId('KAM'),
      clientId: client?.id,
      company: client?.company || '',
      contactName: primary?.name,
      phone: primary?.number,
      status: 'Requirement Logged',
      kam: client?.kam || (kamFilter !== 'all' && kamFilter !== 'unassigned' ? kamFilter : me.name),
      source: client?.source || 'Existing',
      value: 0,
      notes: [],
      createdAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
    };
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">KAM</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Key Account Management · clients handed off once their first order closed
        </p>
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
          {!!orders.length && ` ${orders.length} order${orders.length === 1 ? '' : 's'} already exist and are under Order board — ${openOrderCount} still open, which is the Open orders tile.`}
        </div>
      )}

      <LensTiles groups={tileGroups} active={lens} onPick={pickLens} />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search firm, contact, number or Enq ID…"
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E] w-full sm:w-[280px]" />
        <select value={kamFilter} onChange={(e) => setKamFilter(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All KAMs ({clients.length} firms)</option>
          <option value="unassigned">Unassigned</option>
          {kamOptions.map((k) => <option key={k} value={k}>{k} ({clients.filter((c) => sameRep(c.kam, k)).length})</option>)}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All segments</option>
          {SEGMENTS.map((x) => <option key={x} value={x}>Segment {x}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All sources</option>
          {CLIENT_SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <div className="ml-auto">
          <LensPills
            pills={KAM_SIDE_LENSES.map((k) => ({ key: k, title: KAM_LENS[k].title, rule: KAM_LENS[k].rule, count: loading ? undefined : countOf(k) }))}
            active={lens}
            onPick={pickLens}
          />
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-400 py-8 text-center bg-white rounded-lg border border-gray-200">Loading firms and orders…</p>
        : (isOrderLens(lens) ? ordersFailed : clientsFailed) ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
            <p className="text-[12px] text-gray-600">{isOrderLens(lens) ? 'The order list' : 'The client master'} did not load, so nothing here can be counted yet.</p>
            <button onClick={load} className={btnPrimary}>Try again</button>
          </div>
        ) : lens === 'orders' ? (
          <KamOrdersView
            boardScroll={boardScroll}
            legacyCount={legacyCount}
            orderStatusFilter={orderStatusFilter}
            scopedOrders={filteredOrders}
            setOrderModal={setOrderModal}
            setOrderStatusFilter={setOrderStatusFilter}
            sync={sync}
            unlinkedOrders={unlinkedOrders}
          />
        ) : isOrderLens(lens) ? (
          <KamOrderTable
            lens={lens}
            rows={ordersBy[lens]}
            today={today}
            search={search.trim()}
            valueText={lens === 'pipeline' && (pipeline.pipeline || pipeline.estimatedPipeline)
              ? `${fmtL(pipeline.pipeline)} on tickets · ${fmtL(pipeline.estimatedPipeline)} estimated, never summed` : undefined}
            page={listPage}
            setPage={setListPage}
            onOpen={(o) => setOrderModal({ order: o, isNew: false })}
          />
        ) : lens === 'signoff' ? (
          <KamSignoffTable
            rows={firmRows}
            nowMs={nowMs}
            page={listPage}
            setPage={setListPage}
            canRespond={(c) => canRespondToFirm(c, me, viewer.isManager, live)}
            onRespond={(c) => saveClient(acceptFirmHandover(c, me.name, new Date().toISOString()))}
            onOpen={setDrawerId}
          />
        ) : (
          <KamFirmTable
            lens={lens}
            rows={firmRows}
            today={today}
            search={search.trim()}
            page={listPage}
            setPage={setListPage}
            onOpen={setDrawerId}
            emptyAction={lens === 'overdue' || lens === 'due'
              ? <button onClick={() => pickLens('nofollow')} className={btnGhost}>See firms with no follow-up →</button> : undefined}
          />
        )}

      {drawerRow && (
        <ClientDrawer
          row={drawerRow}
          assignAs={viewer.isManager ? me.name : undefined}
          kams={allKams}
          clients={clients}
          historyFor={historyFor}
          orders={orders.filter((o) => o.clientId === drawerRow.client.id)}
          today={today}
          onClose={() => setDrawerId(null)}
          onLogInteraction={(type) => setLoggingFor({ id: drawerRow.client.id, type })}
          onCheckIn={() => setCheckingInFor(drawerRow.client.id)}
          onSaveClient={saveClient}
          onOpenOrder={(o) => setOrderModal({ order: o, isNew: false })}
          onAddOrder={() => setOrderModal({ order: blankOrder(drawerRow.client), isNew: true })}
        />
      )}

      {loggingClient && (
        <InteractionModal
          client={loggingClient}
          loggedBy={me.name}
          today={today}
          open={openCheckIn(loggingClient.interactions)}
          initialType={loggingFor?.type ?? 'Call'}
          onClose={() => setLoggingFor(null)}
          onSave={(i) => saveClient({ ...loggingClient, interactions: withInteraction(loggingClient.interactions, i) })}
        />
      )}

      {checkingInClient && (
        <CheckInCapture
          title={checkingInClient.company}
          by={me.name}
          onClose={() => setCheckingInFor(null)}
          onDone={(checkIn) => saveClient({
            ...checkingInClient,
            interactions: [...(checkingInClient.interactions || []), {
              id: newB2BId('INT'), type: 'Meeting', date: istDay(checkIn.at), loggedBy: me.name, checkIn, createdAt: checkIn.at,
            }],
          })}
        />
      )}

      {orderModal && (
        <OrderModal
          order={orderModal.order}
          isNew={orderModal.isNew}
          clients={kamFilter === 'all' ? clients : scopedClients}
          kam={kamFilter !== 'all' && kamFilter !== 'unassigned' ? kamFilter : me.name}
          actor={me.name}
          creditPeople={allKams}
          canCredit={viewer.isManager}
          onClose={() => setOrderModal(null)}
          onSave={saveOrder}
        />
      )}

    </div>
  );
}
