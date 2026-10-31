'use client';

import { AccountCard } from './cards/account';
import { ContactsCard } from './cards/contacts';
import { EcVisitsCard } from './cards/ec-visits';
import { GstsCard } from './cards/gsts';
import { DeleteFirm } from './cards/delete-firm';
import { OrdersCard } from './cards/orders';
import { ReferredClientsCard } from './cards/referred-clients';
import { SpocsCard } from './cards/spocs';
import { useFirmLinks } from './hooks/use-firm-links';
import { useFirmOrders } from './hooks/use-firm-orders';
import { fmtDate } from './utils';
import { ClientEntity, ClientOrderMetrics, ClientStatus, contactNumbers, lastOrderInFuture } from '../../models/client';
import { fmtShortINR } from '../../models/mock-data';
import { Rep } from '../../models/outreach/intake';
import { Metric, StatTile, StatusPill } from '../../ui/client-chips';
import { btnGhost } from '../../constants/ui';
import { ClientOrderHistory } from '@/lib/b2b';
import { useEffect, useMemo, useState } from 'react';

export function FirmDrawer({ client, clients, metrics, status, days, historyFor, badges, reassignReason, assignAs, kams = [], onClose, onSave, onEdit, onDelete, canAddStudioNumber, children }: {
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
  onClose: () => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
  onEdit?: () => void;
  onDelete?: (c: ClientEntity) => Promise<string | null>;
  canAddStudioNumber?: boolean;
  children?: React.ReactNode;
}) {
  const phones = useMemo(() => contactNumbers(client.contacts), [client.contacts]);
  const orders = useFirmOrders(phones);
  const links = useFirmLinks(client);
  const [via, setVia] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const facts = [client.clientType || 'Type not set', client.segment ? `Segment ${client.segment}` : 'No segment', client.source];

  return (
    <div className="fixed inset-0 z-[1150] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[880px] max-w-full bg-gray-50 h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold text-gray-900 truncate">{client.company || <span className="text-gray-400 italic">Unnamed firm</span>}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusPill status={status} days={days} />
                {badges}
                <span className="text-[12px] text-gray-500">{facts.join(' · ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onEdit && <button onClick={onEdit} className={btnGhost}>Edit details</button>}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none cursor-pointer" aria-label="Close">×</button>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatTile label="Lifetime revenue" value={<Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtShortINR} />} />
            <StatTile label="Orders" value={<Metric value={metrics.orders} state={metrics.dateState} />} sub={metrics.enquiries !== undefined ? `of ${metrics.enquiries} enquiries` : undefined} />
            <StatTile label="Avg order" value={<Metric value={metrics.averageOrderValue} state={metrics.dateState} format={fmtShortINR} />} />
            <StatTile
              label="Last order"
              value={<span className="text-[15px]"><Metric value={metrics.lastOrderPlaced ? fmtDate(metrics.lastOrderPlaced) : undefined} state={metrics.dateState} /></span>}
              sub={days !== undefined ? `${days} days until ${status === 'Active' ? 'Inactive 1 month' : 'Inactive'}` : undefined}
            />
            <StatTile label="Open carts" value={<Metric value={metrics.openValue} state={metrics.dateState} format={fmtShortINR} />} />
          </div>
          {lastOrderInFuture(metrics) && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              The last order date Django served is after today, so it cannot be a real order. The status is Unknown until Django serves the real order placed date.
            </p>
          )}
          {metrics.dateState === 'unavailable' && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              Some of this firm&apos;s order figures could not be read, so the status is Unknown rather than a guess.
            </p>
          )}

          <SpocsCard
            client={client}
            links={links.links}
            linksLoading={links.loading}
            linksFailed={links.failed}
            orders={orders.details?.rows ?? []}
            ordersLoading={orders.loading}
            ordersFailed={orders.failed}
            assignAs={assignAs}
            onSave={onSave}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <ContactsCard client={client} clients={clients} canAddStudioNumber={canAddStudioNumber} historyFor={historyFor} via={via} onVia={setVia} onSave={onSave} />
            <GstsCard client={client} clients={clients} onSave={onSave} />
          </div>

          <OrdersCard
            details={orders.details}
            loading={orders.loading}
            failed={orders.failed}
            numbers={phones.length}
            via={via}
            onClearVia={() => setVia(null)}
            onRecheck={orders.recheck}
          />

          <ReferredClientsCard client={client} metrics={metrics} />

          <EcVisitsCard client={client} />

          {children}

          <AccountCard key={client.kam || ''} client={client} reassignReason={reassignReason} assignAs={assignAs} kams={kams} onSave={onSave} />

          {onDelete && <DeleteFirm client={client} onDelete={onDelete} />}
        </div>
      </div>
    </div>
  );
}
