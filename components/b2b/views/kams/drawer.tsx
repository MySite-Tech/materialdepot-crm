'use client';

import { FirmDrawer } from '../../drawers/firm';
import { ClientEntity, InteractionType, contactNumbers, currentUpcomingProject, openCheckIn, primaryContact, sortedInteractions } from '../../models/client';
import { RedirectToEc, uniquePhones } from '../../ui/redirect-to-ec';
import { CheckInLine } from '../../ui/check-in-capture';
import { AssignedClientRow, KAM_ORDER_STATUS_COLORS, KamOrder, temperatureMismatch } from '../../models/kam';
import { fmtINR } from '../../models/mock-data';
import { SectionCard } from '../../ui/inbound-chips';
import { TemperatureChip } from '../../ui/client-chips';
import { EscalationSection } from './panels/escalations';
import { Rep } from '../../models/outreach/intake';
import { ClientOrderHistory } from '@/lib/b2b';

export function ClientDrawer({ row, clients, orders, today, historyFor, assignAs, kams, onClose, onLogInteraction, onCheckIn, onSaveClient, onOpenOrder, onAddOrder }: {
  row: AssignedClientRow;
  clients: ClientEntity[];
  orders: KamOrder[];
  today: string;
  historyFor: (phone: string) => ClientOrderHistory | undefined;
  onClose: () => void;
  onLogInteraction: (type: InteractionType) => void;
  onCheckIn: () => void;
  onSaveClient: (c: ClientEntity) => Promise<string | null>;
  assignAs?: string;
  kams: Rep[];
  onOpenOrder: (o: KamOrder) => void;
  onAddOrder: () => void;
}) {
  const { client, metrics } = row;
  const log = sortedInteractions(client.interactions);
  const upcoming = currentUpcomingProject(client.interactions);
  const inProgress = openCheckIn(client.interactions);
  const mismatch = temperatureMismatch(row);
  const link = 'text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap';

  return (
    <FirmDrawer
      client={client}
      clients={clients}
      metrics={metrics}
      status={row.status}
      historyFor={historyFor}
      badges={<TemperatureChip value={row.temperature} previous={row.previousTemperature} at={row.temperatureAt} />}
      reassignReason="Reassigned from the KAM tab"
      onClose={onClose}
      onSave={onSaveClient}
      assignAs={assignAs}
      kams={kams}
    >
      {mismatch && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <span className="font-semibold">Temperature vs. the record:</span> {mismatch.message}{' '}
          <span className="text-amber-700">It stays your call — nothing is changed for you (PRD open question #5).</span>
        </p>
      )}

      <RedirectToEc
        firm={client.company}
        contactName={primaryContact(client.contacts)?.name}
        phones={uniquePhones(contactNumbers(client.contacts))}
        sourceTeam="kam"
        leadRef={client.id}
        clientId={client.id}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <SectionCard
          title="Calls & meetings"
          subtitle={`${log.length} logged`}
          right={(
            <span className="flex items-center gap-3">
              {!inProgress && <button onClick={onCheckIn} className={link}>Check in at a meeting</button>}
              <button onClick={() => onLogInteraction('Call')} className={link}>+ Log interaction</button>
            </span>
          )}
        >
          {inProgress?.checkIn && (
            <div className="mb-2 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-teal-900 font-semibold">Meeting in progress</span>
              <CheckInLine c={inProgress.checkIn} />
              <button onClick={() => onLogInteraction('Meeting')} className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white text-[11px] font-semibold">Add minutes</button>
            </div>
          )}
          <div className="text-[11px] text-gray-500 mb-2">
            <span className="text-gray-400">Upcoming project:</span>{' '}
            {upcoming ? <>{upcoming.text} <span className="text-gray-400">· noted {upcoming.at}</span></> : <span className="text-gray-300">nothing on file</span>}
          </div>
          {!log.length ? (
            <p className="text-[12px] text-gray-300 py-3 text-center border border-dashed border-gray-200 rounded-md">Nothing logged against this account yet.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {log.map((i) => (
                <div key={i.id} className="border border-gray-100 rounded-md p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gray-700">
                      {i.type} · {i.date}
                      {i.loggedBy && <span className="text-gray-400 font-normal"> · {i.loggedBy}</span>}
                    </span>
                    <TemperatureChip value={i.temperature} />
                  </div>
                  {i.checkIn && <div className="mt-1"><CheckInLine c={i.checkIn} /></div>}
                  {i.summary && <p className="text-[12px] text-gray-600 mt-1 break-words">{i.summary}</p>}
                  {i.upcomingProject && <p className="text-[11px] text-gray-500 mt-1"><span className="text-gray-400">Upcoming:</span> {i.upcomingProject}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{i.nextFollowUpDate ? `Next follow-up ${i.nextFollowUpDate}` : 'No next follow-up set'}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="KAM pipeline"
          subtitle={`${orders.length} order${orders.length === 1 ? '' : 's'}`}
          right={<button onClick={onAddOrder} className={link}>+ Add order</button>}
        >
          {!orders.length ? (
            <p className="text-[12px] text-gray-300 py-3 text-center border border-dashed border-gray-200 rounded-md">No KAM-created order against this firm.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {orders.map((o) => (
                <button key={o.id} onClick={() => onOpenOrder(o)} className="text-left border border-gray-100 rounded-md p-2 hover:border-[#0F766E] cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] text-gray-700 min-w-0 break-words">{o.requirement || <span className="text-gray-300">no requirement details</span>}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                      style={{ background: KAM_ORDER_STATUS_COLORS[o.status] + '18', color: KAM_ORDER_STATUS_COLORS[o.status] }}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {o.enqId ? <span className="font-mono font-semibold text-gray-600">{o.enqId}</span> : 'no Enq ID'}
                    {o.orderValue !== undefined ? ` · ${fmtINR(o.orderValue)} from Procurement` : o.estimatedValue ? ` · ${fmtINR(o.estimatedValue)} estimated` : ''}
                    {o.expectedClosure && ` · closes ${o.expectedClosure}`}
                    {o.followUpDate && o.status !== 'Closed' && o.status !== 'Lost' && ` · follow up ${o.followUpDate}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3.5">
        <EscalationSection client={client} today={today} onSave={(escalations) => onSaveClient({ ...client, escalations })} />
      </div>
    </FirmDrawer>
  );
}
