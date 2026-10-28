'use client';

import { InboundLead, OutreachLead } from '../../../models/mock-data';
import {
  INTAKE_REJECT_REASONS, Rep, inboundPool, intakePending, leadFromInbound, planRoundRobin, rejectIntake,
} from '../../../models/outreach/intake';
import { currentMonth } from '../../../models/outreach/kpis';
import { Empty, fmtDay } from '../../../ui/inbound-chips';
import { OutreachScope, SaveLead } from '../types';
import { nowIso } from '../utils';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 25;

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const btn = 'px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap disabled:opacity-50';

function PendingRow({ lead, canAct, onAccept, onReject, onOpen }: {
  lead: OutreachLead; canAct: boolean;
  onAccept: () => void; onReject: (reason: string) => void; onOpen: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate cursor-pointer hover:underline" onClick={onOpen}>{lead.company}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.contactPerson || '—'}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.intake?.inboundOwner || '—'}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.intake?.inboundStage || '—'}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.bm}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDay(lead.intake?.assignedAt)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {!canAct ? <span className="text-[11px] text-gray-400">Waiting on {lead.bm}</span>
          : rejecting ? (
            <div className="flex items-center gap-1.5">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white">
                <option value="">Why?</option>
                {INTAKE_REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button disabled={!reason} onClick={() => onReject(reason)} className={`${btn} bg-red-600 text-white`}>Reject</button>
              <button onClick={() => setRejecting(false)} className={`${btn} border border-gray-200 text-gray-500`}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={onAccept} className={`${btn} bg-[#0F766E] text-white`}>Accept</button>
              <button onClick={() => setRejecting(true)} className={`${btn} border border-gray-200 text-gray-600`}>Reject…</button>
            </div>
          )}
      </td>
    </tr>
  );
}

export function FromInbound({ leads, allLeads, inbound, scope, today, save, createMany, onOpen }: {
  leads: OutreachLead[];
  allLeads: OutreachLead[];
  inbound: InboundLead[] | null;
  scope: OutreachScope;
  today: string;
  save: SaveLead;
  createMany: (list: OutreachLead[], opts?: { onlyNew?: boolean }) => Promise<string | null>;
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const pending = useMemo(() => leads.filter(intakePending), [leads]);
  const pool = useMemo(() => (inbound ? inboundPool(inbound, allLeads) : []), [inbound, allLeads]);
  const assigner = scope.mode !== 'mine';

  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [pool.length]);
  const pages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const rows = pool.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setBusy(false);
  };

  const assign = (items: { lead: InboundLead; rep: Rep }[], accepted: boolean) =>
    run(() => createMany(items.map(({ lead, rep }) => leadFromInbound(lead, rep, scope.me.name, nowIso(), accepted)), { onlyNew: true }));

  const assignAll = () => {
    const plan = planRoundRobin(pool.map((p) => p.lead), scope.reps, allLeads, currentMonth(today));
    return assign(plan.map(({ item, rep }) => ({ lead: item, rep })), false);
  };

  const canAct = (l: OutreachLead) => scope.mode === 'open' || scope.owns(l);

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2">
          <h3 className="text-[12px] font-bold text-gray-800">Waiting for sign-off</h3>
          <span className="text-[11px] font-semibold text-gray-400">{pending.length}</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">
            Inbound only gets credit once the assigned BM accepts. A rejection needs a reason, and those reasons are how Inbound&apos;s lead quality is judged.
          </span>
        </div>
        {!pending.length ? <div className="py-6"><Empty>Nothing waiting.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 bg-gray-50/60">
                {['Firm', 'Contact', 'Inbound owner', 'Inbound stage', 'Assigned to', 'Assigned', ''].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pending.map((l) => (
                  <PendingRow
                    key={l.id}
                    lead={l}
                    canAct={canAct(l)}
                    onOpen={() => onOpen(l.id)}
                    onAccept={() => run(() => save(l, { ...l, intake: { ...l.intake!, acceptedAt: nowIso() } }))}
                    onReject={(reason) => run(() => save(l, rejectIntake(l, reason, nowIso())))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <h3 className="text-[12px] font-bold text-gray-800">Inbound pool</h3>
          <span className="text-[11px] font-semibold text-gray-400">{pool.length}</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">
            Leads Inbound has worked and not lost, with no Outreach lead on the same mobile. Converted by Inbound first.
          </span>
          {assigner && pool.length > 0 && (
            <button disabled={busy || !scope.reps.length} onClick={assignAll} className={`${btn} ml-auto bg-[#0F766E] text-white`}>
              {busy ? 'Assigning…' : `Assign all ${pool.length} round-robin`}
            </button>
          )}
        </div>
        {inbound === null ? (
          <p className="px-4 py-3 text-[11.5px] text-amber-800 bg-amber-50">Inbound leads did not load, so the pool is unknown — not empty. Reload to try again.</p>
        ) : !pool.length ? <div className="py-6"><Empty>Every Inbound lead in play already has an Outreach lead.</Empty></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Firm', 'Contact', 'Inbound owner', 'Inbound stage', 'Created', ''].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map(({ lead, converted }) => (
                    <tr key={lead.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">
                        {lead.companyName || lead.company}
                        {converted && <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wider text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Converted</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.contactName || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.owner || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.stage}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDay(lead.leadCreatedAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {assigner ? (
                          <div className="flex items-center gap-1.5">
                            <select value={pick[lead.id] || ''} onChange={(e) => setPick((p) => ({ ...p, [lead.id]: e.target.value }))}
                              className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white">
                              <option value="">Assign to…</option>
                              {scope.reps.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
                            </select>
                            <button
                              disabled={busy || !pick[lead.id]}
                              onClick={() => assign([{ lead, rep: scope.reps.find((r) => r.name === pick[lead.id])! }], false)}
                              className={`${btn} border border-gray-200 text-gray-700`}
                            >
                              Assign
                            </button>
                          </div>
                        ) : (
                          <button disabled={busy} onClick={() => assign([{ lead, rep: scope.me }], true)} className={`${btn} bg-[#0F766E] text-white`}>
                            Take it
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pool.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">{`Showing ${page * PAGE_SIZE + 1}–${Math.min(pool.length, (page + 1) * PAGE_SIZE)} of ${pool.length}`}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
                  <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                    className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
