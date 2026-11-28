'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClientDrawer } from '../../kams/drawer';
import { InteractionModal, TicketRef } from '../../kams/drawer/interactions';
import { CheckInCapture } from '../../../ui/check-in-capture';
import { useB2BReps } from '../../../hooks/use-b2b-reps';
import { useClientAggregates } from '../../../hooks/use-client-aggregates';
import { ClientEntity, InteractionType, contactNumbers, istToday, openCheckIn, withInteraction } from '../../../models/client';
import { assignedClientRows } from '../../../models/kam';
import { istDay } from '../../../models/outreach/reminders';
import { newB2BId } from '../../../models/ids';
import { upsertClient } from '@/lib/b2b';
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
  const { allKams, byTeam } = useB2BReps(team);
  const me = useMemo(() => ({ name: viewer.member?.name || viewer.name, phone: viewer.phone }), [viewer.member, viewer.name, viewer.phone]);
  const [clients, setClients] = useState<ClientEntity[]>(data.clients);
  const [logging, setLogging] = useState<{ type: InteractionType; ticket?: TicketRef } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
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

  return (
    <>
      <ClientDrawer
        row={row}
        assignAs={viewer.isManager ? me.name : undefined}
        kams={allKams}
        people={byTeam}
        clients={clients}
        historyFor={historyFor}
        today={today}
        onClose={onClose}
        onLogInteraction={(type) => setLogging({ type })}
        onLogTicket={(ticket) => setLogging({ type: 'Call', ticket })}
        onCheckIn={() => setCheckingIn(true)}
        onSaveClient={saveClient}
      />
      {logging && (
        <InteractionModal
          client={client}
          loggedBy={me.name}
          today={today}
          open={openCheckIn(client.interactions)}
          initialType={logging.type}
          ticket={logging.ticket}
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
    </>
  );
}
