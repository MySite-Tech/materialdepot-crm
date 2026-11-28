'use client';

import { AccountCard } from './cards/account';
import { ContactsCard } from './cards/contacts';
import { EcVisitsCard } from './cards/ec-visits';
import { GstsCard } from './cards/gsts';
import { HandoverCard } from './cards/handover';
import { DeleteFirm } from './cards/delete-firm';
import { FirmDetailsModal } from './cards/details';
import { StudioViewCard } from './cards/studio-view';
import { useStudioLogins } from '../../hooks/use-studio-logins';
import { EnquiryActions, OrdersCard } from './cards/orders';
import { ReferredClientsCard } from './cards/referred-clients';
import { SpocReadState, SpocSalesCard, SpocsCard } from './cards/spocs';
import { FirmDrawerHeader, FirmTab, FirmTabDef } from './header';
import { useEcVisits } from './hooks/use-ec-visits';
import { useFirmLinks } from './hooks/use-firm-links';
import { useFirmOrders } from './hooks/use-firm-orders';
import { useFirmSpocs } from './hooks/use-firm-spocs';
import { fmtDate, orderTab } from './utils';
import { ClientEntity, ClientOrderMetrics, ClientStatus, contactNumbers, firmDetailGaps, gstNumbers, lastOrderInFuture, nextStatus, studioFirmOf, ticketFollowUps } from '../../models/client';
import { istToday } from '../../models/inbound';
import { fmtShortINR } from '../../models/mock-data';
import { Rep } from '../../models/outreach/intake';
import { Metric, StatTile } from '../../ui/client-chips';
import { ClientOrderHistory, ClientOrderRow } from '@/lib/b2b';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useState } from 'react';

const NO_PEOPLE: Record<B2BTeam, Rep[]> = { inbound: [], outreach: [], kam: [] };
const NO_ROWS: ClientOrderRow[] = [];

export function FirmDrawer({ client, clients, metrics, status, days, historyFor, badges, reassignReason, assignAs, kams = [], people = NO_PEOPLE, onClose, onSave, onDelete, canAddStudioNumber, activityBadge, defaultTab, onLogTicket, children }: {
  onLogTicket?: (t: { enqId: string; kind: 'cart' | 'pi'; value?: number; status?: string }) => void;
  client: ClientEntity;
  clients: ClientEntity[];
  metrics: ClientOrderMetrics;
  status: ClientStatus;
  days?: number;
  historyFor: (phone: string) => ClientOrderHistory | undefined;
  badges?: React.ReactNode;
  reassignReason: string;
  assignAs?: string;
  kams?: Rep[];
  people?: Record<B2BTeam, Rep[]>;
  onClose: () => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
  defaultTab?: FirmTab;
  onDelete?: (c: ClientEntity) => Promise<string | null>;
  canAddStudioNumber?: boolean;
  activityBadge?: string;
  children?: React.ReactNode;
}) {
  const phones = useMemo(() => contactNumbers(client.contacts), [client.contacts]);
  const gstins = useMemo(() => gstNumbers(client.gsts), [client.gsts]);
  const orders = useFirmOrders(phones, gstins);
  const links = useFirmLinks(client);
  const ec = useEcVisits(client.id, phones);
  const rows = orders.details?.rows ?? NO_ROWS;
  const { isB2B, spocs, sales } = useFirmSpocs(client, links.links, rows, people);
  const [tab, setTab] = useState<FirmTab>(defaultTab ?? (children ? 'activity' : 'overview'));
  const [editing, setEditing] = useState(false);
  const gaps = useMemo(() => firmDetailGaps(client), [client]);
  const followUps = useMemo(() => ticketFollowUps(client.interactions), [client.interactions]);
  const studioAccess = useStudioLogins();
  const studio = useMemo(() => studioFirmOf(client, studioAccess.firms), [client, studioAccess.firms]);
  const [via, setVia] = useState<string | null>(null);
  const [kamPicker, setKamPicker] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  const read: SpocReadState = { linksLoading: links.loading, linksFailed: links.failed, ordersLoading: orders.loading, ordersFailed: orders.failed };
  const openDeals = useMemo(() => rows.filter((r) => { const t = orderTab(r); return t === 'pi' || t === 'open'; }).length, [rows]);
  const today = istToday();
  const upcoming = ec.visits.filter((v) => v.status === 'Scheduled' && (v.visitDate || '') >= today).length;
  const canAssign = assignAs !== undefined;

  const tabs: FirmTabDef[] = [
    ...(children ? [{ key: 'activity' as const, label: 'Activity', badge: activityBadge }] : []),
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: 'Orders', badge: orders.loading || orders.failed ? undefined : openDeals ? `${openDeals} open` : undefined },
    { key: 'people', label: 'People', badge: phones.length ? undefined : 'no number', warn: true },
    { key: 'ec', label: 'EC & handover', badge: ec.loading || ec.error ? undefined : upcoming ? `${upcoming} upcoming` : undefined },
    { key: 'referrals', label: 'Referrals' },
    ...(studio ? [{ key: 'studio' as const, label: 'Studio Space ↗' }] : []),
  ];

  const pickKam = () => { setTab('overview'); setKamPicker(true); };
  const showVia = (phone: string | null) => { setVia(phone); if (phone) setTab('orders'); };

  return (
    <div className="fixed inset-0 z-[1150] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[880px] max-w-full bg-[#F7F7F8] h-full overflow-y-auto shadow-xl flex flex-col">
        <FirmDrawerHeader
          client={client}
          status={status}
          days={days}
          badges={badges}
          spocs={spocs}
          read={read}
          onPeople={canAssign ? () => setTab('people') : undefined}
          gaps={gaps}
          onEdit={() => setEditing(true)}
          onClose={onClose}
          tabs={tabs}
          tab={tab}
          onTab={setTab}
        />

        <div className="p-4 flex flex-col gap-3">
          {tab === 'activity' && children}

          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatTile label="Lifetime revenue" value={<Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtShortINR} />} />
                <StatTile label="Orders" value={<Metric value={metrics.orders} state={metrics.dateState} />} sub={metrics.enquiries !== undefined ? `of ${metrics.enquiries} enquiries` : undefined} />
                <StatTile label="Avg order" value={<Metric value={metrics.averageOrderValue} state={metrics.dateState} format={fmtShortINR} />} />
                <StatTile
                  label="Last order"
                  value={<span className="text-[15px]"><Metric value={metrics.lastOrderPlaced ? fmtDate(metrics.lastOrderPlaced) : undefined} state={metrics.dateState} /></span>}
                  sub={days !== undefined ? `${days} days until ${nextStatus(status)}` : undefined}
                />
                <StatTile label="Open carts" value={<Metric value={metrics.openValue} state={metrics.dateState} format={fmtShortINR} />} />
              </div>
              {lastOrderInFuture(metrics) && (
                <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  The last order date Django served is after today, so it cannot be a real order. The status is Unknown until Django serves the real order placed date.
                </p>
              )}
              {metrics.dateState === 'unavailable' && (
                <p className="text-[12px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                  Some of this firm&apos;s order figures could not be read, so the status is Unknown rather than a guess.
                </p>
              )}
              <AccountCard key={client.kam || ''} client={client} reassignReason={reassignReason} assignAs={assignAs} kams={kams} picking={kamPicker} onPicking={setKamPicker} onSave={onSave} />
            </>
          )}

          {tab === 'orders' && (
            <>
              <OrdersCard
                details={orders.details}
                loading={orders.loading}
                failed={orders.failed}
                phones={phones}
                historyFor={historyFor}
                via={via}
                onClearVia={() => setVia(null)}
                onRecheck={orders.recheck}
                renderActions={(r) => <EnquiryActions client={client} row={r} ec={ec} people={people} assignAs={assignAs} onSave={onSave} />}
                followUps={followUps}
                preferOpen={!!children}
                onLogTicket={onLogTicket ? (r) => onLogTicket({ enqId: r.enqId, kind: orderTab(r) === 'pi' ? 'pi' : 'cart', value: r.orderValue, status: r.status }) : undefined}
              />
              <SpocSalesCard sales={sales} loading={orders.loading} failed={orders.failed} />
            </>
          )}

          {tab === 'people' && (
            <>
              <SpocsCard client={client} spocs={spocs} isB2B={isB2B} read={read} assignAs={assignAs} people={people} onChangeKam={pickKam} onSave={onSave} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <ContactsCard client={client} clients={clients} canAddStudioNumber={canAddStudioNumber} historyFor={historyFor} via={via} onVia={showVia} onSave={onSave} />
                <GstsCard client={client} clients={clients} onSave={onSave} />
              </div>
              {onDelete && <DeleteFirm client={client} onDelete={onDelete} />}
            </>
          )}

          {tab === 'ec' && (
            <>
              <EcVisitsCard client={client} ec={ec} />
              <HandoverCard lead={links.links.handover} failed={links.failed} />
            </>
          )}

          {tab === 'referrals' && <ReferredClientsCard client={client} metrics={metrics} />}

          {tab === 'studio' && studio && <StudioViewCard studio={studio} />}
        </div>
        {editing && <FirmDetailsModal client={client} clients={clients} onClose={() => setEditing(false)} onSave={onSave} />}
      </div>
    </div>
  );
}
