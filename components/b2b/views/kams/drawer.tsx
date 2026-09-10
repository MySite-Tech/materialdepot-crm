'use client';

import { ClientEntity, contactLabel, currentUpcomingProject, sortedInteractions } from '../../models/client';
import { AssignedClientRow, KAM_ORDER_STATUS_COLORS, KamOrder, temperatureMismatch } from '../../models/kam';
import { KAMS, fmtINR, fmtL } from '../../models/mock-data';
import { EscalationSection } from './panels/escalations';
import { StatTile, StatusPill, TemperatureChip } from './ui';
import { btnPrimary } from '../../constants/ui';
import { useState } from 'react';

export function ClientDrawer({ row, orders, today, onClose, onLogInteraction, onSaveClient, onOpenOrder, onAddOrder }: {
  row: AssignedClientRow;
  orders: KamOrder[];
  today: string;
  onClose: () => void;
  onLogInteraction: () => void;
  onSaveClient: (c: ClientEntity) => Promise<string | null>;
  onOpenOrder: (o: KamOrder) => void;
  onAddOrder: () => void;
}) {
  const { client, metrics } = row;
  const log = sortedInteractions(client.interactions);
  const upcoming = currentUpcomingProject(client.interactions);
  const mismatch = temperatureMismatch(row);
  const [reassigning, setReassigning] = useState(false);
  const [nextKam, setNextKam] = useState(client.kam || '');
  const [error, setError] = useState('');

  const reassign = async () => {
    setError('');
    const err = await onSaveClient({
      ...client,
      kam: nextKam || undefined,
      assignments: [...(client.assignments || []), { kam: nextKam, at: new Date().toISOString(), reason: 'Reassigned from the KAM tab' }],
    });
    if (err) setError(err); else setReassigning(false);
  };

  return (
    <div className="fixed inset-0 z-[1150] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[640px] bg-white h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 truncate">{client.company}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusPill status={row.status} />
              <TemperatureChip value={row.temperature} previous={row.previousTemperature} at={row.temperatureAt} />
              <span className="text-[11px] text-gray-400">{client.source}</span>
              {client.segment && <span className="text-[11px] text-gray-400">· Segment {client.segment}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Orders" value={metrics.orders ?? '—'} />
            <StatTile label="Total revenue" value={metrics.totalRevenue !== undefined ? fmtL(metrics.totalRevenue) : '—'} />
            <StatTile label="Avg order" value={metrics.averageOrderValue !== undefined ? fmtL(metrics.averageOrderValue) : '—'} />
            <StatTile label="Last order" value={metrics.lastOrderPlaced || (metrics.dateState === 'unavailable' ? 'unread' : '—')} />
          </div>
          {metrics.dateState === 'unavailable' && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
              Some of this client&apos;s order dates could not be read, so the status is Unknown rather than a guess.
            </p>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Contacts</div>
            {(client.contacts || []).map((c) => (
              <div key={c.number} className="text-[12px] text-gray-600">
                <span className="font-mono">{c.number}</span>
                {contactLabel(c) && <span className="text-gray-400"> · {contactLabel(c)}</span>}
                {c.primary && <span className="ml-1 text-[9px] font-bold text-[#0F766E]">PRIMARY</span>}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-md px-3 py-2">
            <div className="text-[12px]">
              <span className="text-gray-400">KAM</span>{' '}
              <span className="font-semibold text-gray-800">{client.kam || 'unassigned'}</span>
              {!!(client.assignments || []).length && (
                <span className="text-[10px] text-gray-400 block">
                  {(client.assignments || []).length} assignment{(client.assignments || []).length === 1 ? '' : 's'}{' '}on record
                </span>
              )}
            </div>
            {reassigning ? (
              <div className="flex items-center gap-1.5">
                <select value={nextKam} onChange={(e) => setNextKam(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white">
                  <option value="">Unassigned</option>
                  {[...new Set([...KAMS, ...(client.kam ? [client.kam] : [])])].sort().map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={reassign} className={btnPrimary}>Save</button>
                <button onClick={() => setReassigning(false)} className="text-[11px] text-gray-400 cursor-pointer">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setReassigning(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Reassign</button>
            )}
          </div>
          {error && <p className="text-[11px] text-red-600">Could not save: {error}</p>}

          <div className="border border-gray-200 rounded-md px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Upcoming project · §3.3</div>
            {upcoming
              ? <p className="text-[12px] text-gray-700">{upcoming.text} <span className="text-[10px] text-gray-400">· noted {upcoming.at}</span></p>
              : <p className="text-[12px] text-gray-300">Nothing on file. It is captured on an interaction.</p>}
          </div>

          {mismatch && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              <span className="font-semibold">Temperature vs. the record:</span> {mismatch.message}{' '}
              <span className="text-amber-700">It stays your call — nothing is changed for you (PRD open question #5).</span>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Latest interaction · §3.1 · {log.length}</span>
              <button onClick={onLogInteraction} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">+ Log call / meeting</button>
            </div>
            {!log.length ? (
              <p className="text-[12px] text-gray-300 py-3 text-center border border-dashed border-gray-200 rounded-md">
                Nothing logged against this account yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {log.map((i) => (
                  <div key={i.id} className="border border-gray-100 rounded-md p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-gray-700">
                        {i.type} · {i.date}
                        {i.loggedBy && <span className="text-gray-400 font-normal"> · {i.loggedBy}</span>}
                      </span>
                      <TemperatureChip value={i.temperature} />
                    </div>
                    {i.summary && <p className="text-[12px] text-gray-600 mt-1 break-words">{i.summary}</p>}
                    {i.upcomingProject && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        <span className="text-gray-400">Upcoming:</span> {i.upcomingProject}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {i.nextFollowUpDate ? `Next follow-up ${i.nextFollowUpDate}` : 'No next follow-up set'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active orders · §5 · {orders.length}</span>
              <button onClick={onAddOrder} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">+ Add order</button>
            </div>
            {!orders.length ? (
              <p className="text-[12px] text-gray-300">No KAM-created order against this client.</p>
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
                      {o.enqId ? <span className="font-mono">{o.enqId}</span> : 'no Enq ID'}
                      {o.orderValue !== undefined ? ` · ${fmtINR(o.orderValue)} from Procurement` : o.estimatedValue ? ` · ${fmtINR(o.estimatedValue)} estimated` : ''}
                      {o.expectedClosure && ` · closes ${o.expectedClosure}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <EscalationSection
            client={client}
            today={today}
            onSave={(escalations) => onSaveClient({ ...client, escalations })}
          />
        </div>
      </div>
    </div>
  );
}
