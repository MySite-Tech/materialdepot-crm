'use client';

import { KamFirmTable } from './lists/firms';
import { KamSignoffTable } from './lists/signoff';
import { KamDealTable } from './lists/deals';
import { KamReferralTable } from './lists/referrals';
import { ClientDrawer } from './drawer';
import { InteractionModal, TicketRef } from './drawer/interactions';
import { useKamData } from './hooks/use-kam-data';
import { isDealLens, isReferralLens, useKamLenses } from './hooks/use-kam-lenses';

import { CLIENT_SOURCES, ClientEntity, InteractionType, contactNumbers, istToday, openCheckIn, withInteraction } from '../../models/client';
import { DAILY_CALL_TARGET, KAM_LENS, KAM_SIDE_LENSES, KamLens, SEGMENTS, canRespondToFirm, ownsFirm, acceptFirmHandover, rejectFirmHandover, sortFirmsForLens } from '../../models/kam';
import { newB2BId } from '../../models/ids';
import { repNames, sameRep } from '../../models/outreach/handover';
import { useOpenDeals } from '../../hooks/use-open-deals';
import { FilterBar } from '../../ui/filter-bar';
import { LensPills, LensTiles } from '../../ui/lens-tiles';
import { btnGhost, btnPrimary } from '../../constants/ui';
import { istDay } from '../../models/outreach/reminders';
import { CheckInCapture } from '../../ui/check-in-capture';
import { useB2BReps } from '../../hooks/use-b2b-reps';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { membershipIn } from '@/lib/b2b/team/utils';
import { openDealsSince } from '@/lib/b2b/inbound-deals/utils';
import { useEffect, useMemo, useState } from 'react';

export default function KAMs({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const data = useKamData();
  const { clients, loading, readingOrders, failed, saveClient } = data;

  const [lens, setLens] = useState<KamLens>('deals');
  const [listPage, setListPage] = useState(0);
  const [kamFilter, setKamFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('all');
  const [source, setSource] = useState('all');

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [loggingFor, setLoggingFor] = useState<{ id: string; type: InteractionType; ticket?: TicketRef } | null>(null);
  const [checkingInFor, setCheckingInFor] = useState<string | null>(null);

  const today = istToday();
  const { live, allKams, byTeam } = useB2BReps(team);
  const me = useMemo(() => ({ name: viewer.member?.name || viewer.name, phone: viewer.phone }), [viewer.member, viewer.name, viewer.phone]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { setNowMs(Date.now()); }, [clients]);

  const kamOptions = useMemo(() => repNames(allKams, clients.map((c) => c.kam)), [allKams, clients]);

  const manager = viewer.isManager;
  const assignedFirms = useMemo(() => clients.filter((c) => (manager ? !!c.kam : ownsFirm(c, me))), [clients, manager, me]);
  const scopedClients = useMemo(() => {
    if (!manager || kamFilter === 'all') return assignedFirms;
    return kamFilter === 'unassigned' ? clients.filter((c) => !c.kam) : assignedFirms.filter((c) => sameRep(c.kam, kamFilter));
  }, [clients, assignedFirms, manager, kamFilter]);
  const unassignedCount = useMemo(() => clients.filter((c) => !c.kam).length, [clients]);

  const dealFirms = manager ? clients : assignedFirms;
  const referredPhones = useMemo(() => {
    const ids = new Set(dealFirms.map((c) => c.id));
    return (data.referrals ?? []).filter((r) => r.referrerKind === 'client' && ids.has(r.referrerId)).map((r) => r.clientPhone);
  }, [data.referrals, dealFirms]);
  const phoneKey = useMemo(
    () => [...new Set([...dealFirms.flatMap((c) => contactNumbers(c.contacts)), ...referredPhones])].sort().join(','),
    [dealFirms, referredPhones],
  );
  const deals = useOpenDeals(phoneKey, !loading && !failed.includes('the client master'));
  const dealsByPhone = deals.status === 'ready' ? deals.byPhone : null;

  const callTarget = manager && kamFilter === 'all'
    ? repNames([], assignedFirms.map((c) => c.kam)).length * DAILY_CALL_TARGET
    : DAILY_CALL_TARGET;

  const canRespond = useMemo(() => (manager ? null : (c: ClientEntity) => canRespondToFirm(c, me, false, live)), [manager, me, live]);
  const q = search.trim().toLowerCase();
  const L = useKamLenses({
    scoped: scopedClients, metricsFor: data.metricsFor, historyFor: data.historyFor, dealsByPhone,
    referrals: data.referrals, studioFirms: data.studioFirms, q, segment, source, today, nowMs, canRespond, callTarget,
    state: {
      loading, readingOrders,
      clients: failed.includes('the client master') ? 'failed' : null,
      deals: deals.status === 'pending' ? 'pending' : deals.status === 'failed' ? 'failed' : null,
      referrals: failed.includes('the referral list') ? 'failed' : null,
    },
  });

  const firmRows = useMemo(
    () => (isDealLens(lens) || isReferralLens(lens) ? [] : sortFirmsForLens(lens, L.firmsBy[lens], today)),
    [lens, L.firmsBy, today],
  );

  useEffect(() => { setListPage(0); }, [lens, kamFilter, q, segment, source]);


  const drawerRow = useMemo(() => L.rows.find((r) => r.client.id === drawerId) || null, [L.rows, drawerId]);
  const loggingClient = useMemo(() => clients.find((c) => c.id === loggingFor?.id) || null, [clients, loggingFor]);
  const checkingInClient = useMemo(() => clients.find((c) => c.id === checkingInFor) || null, [clients, checkingInFor]);
  const listLoad = L.loadOf(lens);
  const dealNotice = deals.truncated
    ? <p className="px-4 py-2 text-[11.5px] text-amber-800 bg-amber-50 border-b border-amber-100">Django returned more open tickets than one read holds, so some carts may be missing.</p>
    : undefined;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">KAM</h1>
        <p className="text-xs text-gray-400 mt-0.5">Key Account Management · clients handed off once their first order closed</p>
      </div>

      {!!failed.length && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Partly loaded.</span> {failed.join(' and ')}{' '}could not be read, so the{' '}
          numbers below are incomplete. <button onClick={data.load} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}
      {deals.status === 'failed' && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Open carts and PIs could not be read</span> ({deals.error}), so Carts &amp; PIs reads Unknown.{' '}
          <button onClick={deals.refresh} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {!failed.length && !assignedFirms.length && !loading && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-900">
          {manager ? (
            <><span className="font-semibold">No firm has a KAM yet.</span> Pick &quot;No KAM yet&quot; in the KAM filter to assign them.</>
          ) : membershipIn(viewer, 'kam') ? (
            <><span className="font-semibold">No firm has you as its KAM yet.</span> A B2B manager assigns firms from this tab, and they appear here waiting for your sign-off.</>
          ) : (
            <><span className="font-semibold">You are signed in as {me.name || 'a user with no name'} on {me.phone || 'no number'}, which is not on the KAM team list.</span>{' '}
            Firms are matched to you by that number, so none can show here. A B2B manager adds this number under B2B → Team.</>
          )}
        </div>
      )}

      <LensTiles groups={L.tileRows[0]} active={lens} onPick={setLens} />
      <LensTiles groups={L.tileRows[1]} active={lens} onPick={setLens} />

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search firm, contact, number, Enq ID or referred client"
        fields={[
          ...(manager ? [{
            key: 'kam', label: 'KAM', value: kamFilter, any: `All (${assignedFirms.length} firms)`,
            options: [
              { v: 'unassigned', t: `No KAM yet (${unassignedCount})` },
              ...kamOptions.map((k) => ({ v: k, t: `${k} (${assignedFirms.filter((c) => sameRep(c.kam, k)).length})` })),
            ],
          }] : []),
          { key: 'segment', label: 'Segment', value: segment, options: SEGMENTS.map((x) => ({ v: x, t: `Segment ${x}` })) },
          { key: 'source', label: 'Source', value: source, options: CLIENT_SOURCES.map((x) => ({ v: x, t: x })) },
        ]}
        onSet={(key, v) => (key === 'kam' ? setKamFilter(v) : key === 'segment' ? setSegment(v) : setSource(v))}
        onClearAll={() => { setKamFilter('all'); setSegment('all'); setSource('all'); }}
        right={(
          <LensPills
            pills={KAM_SIDE_LENSES.map((k) => ({ key: k, title: KAM_LENS[k].title, rule: KAM_LENS[k].rule, count: loading ? undefined : L.countOf(k) }))}
            active={lens}
            onPick={setLens}
          />
        )}
      />

      {!loading && readingOrders && <p className="mb-2 text-[11.5px] text-gray-500">Reading order history. Status reads Unknown until it lands, a few seconds.</p>}
      {loading || listLoad === 'pending' ? (
        <p className="text-sm text-gray-400 py-8 text-center bg-white rounded-lg border border-gray-200">{loading ? 'Loading firms…' : 'Reading open carts, PIs and orders…'}</p>
      ) : listLoad === 'failed' ? (
        <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
          <p className="text-[12px] text-gray-600">{KAM_LENS[lens].title} could not be read, so nothing here can be counted yet.</p>
          <button onClick={isDealLens(lens) ? deals.refresh : data.load} className={btnPrimary}>Try again</button>
        </div>
      ) : isReferralLens(lens) ? (
        <KamReferralTable lens={lens} rows={L.referralsBy[lens]} today={today} search={search.trim()} page={listPage} setPage={setListPage} onOpen={setDrawerId} />
      ) : isDealLens(lens) ? (
        <KamDealTable
          lens={lens} rows={L.ticketsBy[lens]} today={today} search={search.trim()} since={openDealsSince(today)} notice={dealNotice}
          page={listPage} setPage={setListPage} onOpen={setDrawerId}
          onLog={(t) => setLoggingFor({ id: t.firm.client.id, type: 'Call', ticket: { enqId: t.deal.enqId, kind: t.deal.kind, value: t.deal.value, status: t.deal.status } })}
        />
      ) : lens === 'signoff' ? (
        <KamSignoffTable
          rows={firmRows}
          nowMs={nowMs}
          page={listPage}
          setPage={setListPage}
          canRespond={(c) => canRespondToFirm(c, me, viewer.isManager, live)}
          onAccept={(c) => saveClient(acceptFirmHandover(c, me.name, new Date().toISOString()))}
          onReject={(c, reason) => saveClient(rejectFirmHandover(c, me.name, new Date().toISOString(), reason))}
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
          emptyAction={lens === 'overdue' || lens === 'due' || lens === 'work'
            ? <button onClick={() => setLens('nofollow')} className={btnGhost}>See firms with no follow-up →</button> : undefined}
        />
      )}

      {drawerRow && (
        <ClientDrawer
          row={drawerRow}
          assignAs={viewer.isManager ? me.name : undefined}
          kams={allKams}
          people={byTeam}
          clients={clients}
          historyFor={data.historyFor}
          today={today}
          onClose={() => setDrawerId(null)}
          onLogInteraction={(type) => setLoggingFor({ id: drawerRow.client.id, type })}
          onLogTicket={(ticket) => setLoggingFor({ id: drawerRow.client.id, type: 'Call', ticket })}
          onCheckIn={() => setCheckingInFor(drawerRow.client.id)}
          onSaveClient={saveClient}
          defaultTab={isReferralLens(lens) ? 'referrals' : isDealLens(lens) ? 'orders' : undefined}
        />
      )}

      {loggingClient && (
        <InteractionModal
          client={loggingClient}
          loggedBy={me.name}
          today={today}
          open={openCheckIn(loggingClient.interactions)}
          initialType={loggingFor?.type ?? 'Call'}
          ticket={loggingFor?.ticket}
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

    </div>
  );
}
