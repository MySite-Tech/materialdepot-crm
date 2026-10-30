'use client';

import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { PoolLead, Rep, assignLead, intakePending, leadFromInbound, planRoundRobin, rejectIntake } from '../../../models/outreach/intake';
import { currentMonth } from '../../../models/outreach/kpis';
import { AssignTarget, isRoundRobin } from '../../../ui/assign-bar';
import { OutreachScope, SaveLead } from '../types';
import { nowIso } from '../utils';
import { InboundPool } from './inbound-pool';
import { PendingSection } from './pending';
import { UnassignedPool } from './unassigned';
import { useMemo, useState } from 'react';

const RR_RULE = 'Gives each lead to whichever of these BMs has the fewest leads assigned this month, Inbound and admin assignments together.';

export function Assignments({ leads, allLeads, pool, unassigned, scope, today, save, saveMany, createMany, onOpen }: {
  leads: OutreachLead[];
  allLeads: OutreachLead[];
  pool: PoolLead[] | null;
  unassigned: OutreachLead[];
  scope: OutreachScope;
  today: string;
  save: SaveLead;
  saveMany: (pairs: { before: OutreachLead; after: OutreachLead }[]) => Promise<string | null>;
  createMany: (list: OutreachLead[], opts?: { onlyNew?: boolean }) => Promise<string | null>;
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useMemo(() => leads.filter(intakePending), [leads]);
  const assigner = scope.isManager;
  const month = currentMonth(today);

  const run = async (fn: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setBusy(false);
    return !err;
  };

  const assignInbound = (items: { lead: InboundLead; rep: Rep }[], self: boolean, roundRobin = false) =>
    run(() => createMany(items.map(({ lead, rep }) => leadFromInbound(lead, rep, scope.me.name, nowIso(), self ? 'self' : roundRobin ? 'round-robin' : 'manual')), { onlyNew: true }));

  const assignInboundAll = () => {
    const plan = planRoundRobin((pool ?? []).map((p) => p.lead), scope.rotationReps, allLeads, month);
    return assignInbound(plan.map(({ item, rep }) => ({ lead: item, rep })), false, true);
  };

  const assignPool = (list: OutreachLead[], to: AssignTarget) => {
    const at = nowIso();
    const plan = isRoundRobin(to)
      ? planRoundRobin(list, to.among, allLeads, month)
      : list.map((item) => ({ item, rep: to }));
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    return run(() => saveMany(plan.map(({ item, rep }) => ({ before: item, after: assignLead(item, rep, scope.me.name, at, how) }))));
  };

  const canAct = (l: OutreachLead) => scope.mode === 'open' || scope.owns(l);

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      <PendingSection
        pending={pending}
        canAct={canAct}
        onOpen={onOpen}
        onAccept={(l) => run(() => save(l, { ...l, intake: { ...l.intake!, acceptedAt: nowIso() } }))}
        onReject={(l, reason) => run(() => save(l, rejectIntake(l, reason, nowIso(), scope.me.name)))}
      />
      {assigner && (
        <UnassignedPool leads={unassigned} reps={scope.reps} rotation={scope.rotationReps} assigner={assigner} busy={busy} rrRule={RR_RULE}
          onAssign={assignPool} onOpen={onOpen} />
      )}
      <InboundPool pool={pool} reps={scope.reps} me={scope.me} assigner={assigner} busy={busy}
        onAssign={(lead, rep, self) => assignInbound([{ lead, rep }], self)} onAssignAll={assignInboundAll} />
    </div>
  );
}
