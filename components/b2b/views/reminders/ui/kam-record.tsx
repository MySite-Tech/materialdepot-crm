'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClientDrawer } from '../../kams/drawer';
import { InteractionModal } from '../../kams/panels/interactions';
import { OrderModal } from '../../kams/orders/modal';
import { CheckInCapture } from '../../../ui/check-in-capture';
import { useB2BReps } from '../../../hooks/use-b2b-reps';
import { useClientAggregates } from '../../../hooks/use-client-aggregates';
import { ClientEntity, InteractionType, contactNumbers, istToday, openCheckIn, primaryContact, withInteraction } from '../../../models/client';
import { KamOrder, assignedClientRows, ownsFirm } from '../../../models/kam';
import { istDay } from '../../../models/outreach/reminders';
import { newB2BId } from '../../../models/ids';
import { upsertClient, upsertKamOrder } from '@/lib/b2b';
import type { B2BData } from '@/lib/b2b';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';

export function KamRecord({ clientId, data, team, viewer, onClose }: {
  clientId: string;
  data: B2BData;
  team: B2BTeamLoad;
  viewer: Viewer;
  onClose: () => void;
}) {
  const today = istToday();
  const { allKams } = useB2BReps(team);
  const me = useMemo(() => ({ name: viewer.member?.name || viewer.name, phone: viewer.phone }), [viewer.member, viewer.name, viewer.phone]);
  const [clients, setClients] = useState<ClientEntity[]>(data.clients);
  const [orders, setOrders] = useState<KamOrder[]>(data.kam);
  const [logging, setLogging] = useState<InteractionType | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [orderModal, setOrderModal] = useState<{ order: KamOrder; isNew: boolean } | null>(null);
  const { load, addPhones, metricsFor, historyFor } = useClientAggregates();

  const client = clients.find((c) => c.id === clientId) ?? null;
  const phoneKey = client ? contactNumbers(client.contacts).join(',') : '';
  useEffect(() => { if (phoneKey) load(phoneKey.split(',')); }, [phoneKey, load]);
  const row = useMemo(() => (client ? assignedClientRows([client], metricsFor, today)[0] : null), [client, metricsFor, today]);

  if (!client || !row) return null;

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

  const blankOrder = (): KamOrder => {
    const primary = primaryContact(client.contacts);
    const at = new Date().toISOString();
    return {
      id: newB2BId('KAM'), clientId: client.id, company: client.company, contactName: primary?.name, phone: primary?.number,
      status: 'Requirement Logged', kam: client.kam || me.name, source: client.source || 'Existing',
      value: 0, notes: [], createdAt: at, statusChangedAt: at,
    };
  };

  return (
    <>
      <ClientDrawer
        row={row}
        assignAs={viewer.isManager ? me.name : undefined}
        kams={allKams}
        clients={clients}
        historyFor={historyFor}
        orders={orders.filter((o) => o.clientId === client.id)}
        today={today}
        onClose={onClose}
        onLogInteraction={setLogging}
        onCheckIn={() => setCheckingIn(true)}
        onSaveClient={saveClient}
        onOpenOrder={(o) => setOrderModal({ order: o, isNew: false })}
        onAddOrder={() => setOrderModal({ order: blankOrder(), isNew: true })}
      />
      {logging && (
        <InteractionModal
          client={client}
          loggedBy={me.name}
          today={today}
          open={openCheckIn(client.interactions)}
          initialType={logging}
          onClose={() => setLogging(null)}
          onSave={(i) => saveClient({ ...client, interactions: withInteraction(client.interactions, i) })}
        />
      )}
      {checkingIn && (
        <CheckInCapture
          title={client.company}
          by={me.name}
          onClose={() => setCheckingIn(false)}
          onDone={(checkIn) => saveClient({
            ...client,
            interactions: [...(client.interactions || []), {
              id: newB2BId('INT'), type: 'Meeting', date: istDay(checkIn.at), loggedBy: me.name, checkIn, createdAt: checkIn.at,
            }],
          })}
        />
      )}
      {orderModal && (
        <OrderModal
          order={orderModal.order}
          isNew={orderModal.isNew}
          clients={viewer.isManager ? clients : clients.filter((c) => ownsFirm(c, me))}
          kam={client.kam || me.name}
          actor={me.name}
          creditPeople={allKams}
          canCredit={viewer.isManager}
          onClose={() => setOrderModal(null)}
          onSave={saveOrder}
        />
      )}
    </>
  );
}
