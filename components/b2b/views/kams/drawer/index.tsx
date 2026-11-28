'use client';

import { FirmDrawer } from '../../../drawers/firm';
import type { FirmTab } from '../../../drawers/firm/header';
import { ClientEntity, InteractionType, currentUpcomingProject, openCheckIn, sortedInteractions } from '../../../models/client';
import { CheckInLine } from '../../../ui/check-in-capture';
import { AssignedClientRow, temperatureMismatch } from '../../../models/kam';
import type { TicketRef } from './interactions';
import { SectionCard } from '../../../ui/inbound-chips';
import { TemperatureChip } from '../../../ui/client-chips';
import { EscalationSection } from './escalations';
import { Rep } from '../../../models/outreach/intake';
import { ClientOrderHistory } from '@/lib/b2b';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { fmtFollowUp } from '../../../models/reminders';

export function ClientDrawer({ row, clients, today, historyFor, assignAs, kams, people, defaultTab, onClose, onLogInteraction, onLogTicket, onCheckIn, onSaveClient }: {
  defaultTab?: FirmTab;
  row: AssignedClientRow;
  clients: ClientEntity[];
  onLogTicket: (t: TicketRef) => void;
  today: string;
  historyFor: (phone: string) => ClientOrderHistory | undefined;
  onClose: () => void;
  onLogInteraction: (type: InteractionType) => void;
  onCheckIn: () => void;
  onSaveClient: (c: ClientEntity) => Promise<string | null>;
  assignAs?: string;
  kams: Rep[];
  people: Record<B2BTeam, Rep[]>;
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
      people={people}
      activityBadge={log.length ? String(log.length) : undefined}
      defaultTab={defaultTab}
      onLogTicket={onLogTicket}
    >
      {mismatch && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <span className="font-semibold">Temperature vs. the record:</span> {mismatch.message}{' '}
          <span className="text-amber-700">It stays your call — nothing is changed for you (PRD open question #5).</span>
        </p>
      )}

      <div className="flex flex-col gap-4">
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
                      {i.enqId && <span className="ml-1 font-normal text-indigo-700">on {i.ticketKind === 'pi' ? 'PI' : 'cart'} {i.enqId}</span>}
                      {i.loggedBy && <span className="text-gray-400 font-normal"> · {i.loggedBy}</span>}
                    </span>
                    <TemperatureChip value={i.temperature} />
                  </div>
                  {i.checkIn && <div className="mt-1"><CheckInLine c={i.checkIn} /></div>}
                  {i.summary && <p className="text-[12px] text-gray-600 mt-1 break-words">{i.summary}</p>}
                  {i.upcomingProject && <p className="text-[11px] text-gray-500 mt-1"><span className="text-gray-400">Upcoming:</span> {i.upcomingProject}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{i.nextFollowUpDate
                    ? `Next follow-up ${fmtFollowUp(i.nextFollowUpDate, i.nextFollowUpTime)}${i.enqId ? '' : ` · a ${(i.nextFollowUpFor ?? 'Call').toLowerCase()}`}`
                    : 'No next follow-up set'}</p>
                </div>
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
