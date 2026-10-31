'use client';

import { usePicked } from '../../../hooks/use-picked';
import { OutreachLead } from '../../../models/mock-data';
import { isCrmAddedLead } from '../../../models/inbound/kylas';
import { sameRep } from '../../../models/outreach/handover';
import { Rep, assignLead, isUnassigned, planRoundRobin, spreadByLoad } from '../../../models/outreach/intake';
import { withJourney } from '../../../models/outreach/reminders';
import { AssignTarget, AssignTeams, isRoundRobin } from '../../../ui/assign-bar';
import { UnifiedLead, inboundToUnified, istToday, outreachToUnified, upsertInboundLeads, upsertOutreachLeads } from '@/lib/b2b';
import { INBOUND_INTAKE_KYLAS_ID, INBOUND_ROTATION_BATCH } from '@/lib/b2b/team/constants';
import { reassignInboundLeads } from '@/lib/b2b/team';
import type { B2BTeam, TeamMember } from '@/lib/b2b/team/types';
import { useMemo, useState } from 'react';

const REASON = 'Assigned from the Leads tab';

const open = (l: UnifiedLead) => l.status !== 'Closed' && !l.lost;

const noOwner = (l: UnifiedLead) => (l.inbound
  ? !l.inbound.ownerId || l.inbound.ownerId === INBOUND_INTAKE_KYLAS_ID
  : !!l.outreach && isUnassigned(l.outreach));

const plural = (n: number) => `${n} lead${n === 1 ? '' : 's'}`;

export function useLeadAssign({ leads, members, reps, rotationReps, by, onSaved }: {
  leads: UnifiedLead[];
  members: TeamMember[];
  reps: Rep[];
  rotationReps: Rep[];
  by: string;
  onSaved: (list: UnifiedLead[]) => void;
}) {
  const { picked, toggle, togglePage, pickAll, clear } = usePicked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const inboundTeam = useMemo(() => members
    .filter((m) => m.team === 'inbound' && m.active && m.kylasUserId != null)
    .sort((a, b) => a.name.localeCompare(b.name)), [members]);
  const inboundReps = useMemo<Rep[]>(() => inboundTeam.map((m) => ({ name: m.name, phone: m.phone })), [inboundTeam]);
  const inboundRotation = useMemo<Rep[]>(() => inboundTeam.filter((m) => m.inRotation).map((m) => ({ name: m.name, phone: m.phone })), [inboundTeam]);

  const selected = useMemo(() => leads.filter((l) => picked.has(l.key)), [leads, picked]);
  const teams = useMemo<AssignTeams>(() => ({
    ...(selected.some((l) => l.source === 'Inbound') ? { inbound: { reps: inboundReps, rotation: inboundRotation } } : {}),
    ...(selected.some((l) => l.source === 'Outreach') ? { outreach: { reps, rotation: rotationReps } } : {}),
  }), [selected, inboundReps, inboundRotation, reps, rotationReps]);

  const moveOutreach = async (list: UnifiedLead[], to: AssignTarget): Promise<string | null> => {
    const at = new Date().toISOString();
    const items = list.map((l) => l.outreach as OutreachLead);
    const all = leads.flatMap((l) => (l.outreach ? [l.outreach] : []));
    const plan = isRoundRobin(to)
      ? planRoundRobin(items, to.among, all, istToday().slice(0, 7))
      : items.filter((l) => !sameRep(l.bm, to.name)).map((item) => ({ item, rep: to }));
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    const next = plan.map(({ item, rep }) => withJourney(item, assignLead(item, rep, by, at, how), by, at));
    const err = await upsertOutreachLeads(next);
    if (err) return `Nothing was assigned: ${err}`;
    onSaved(next.map(outreachToUnified));
    return null;
  };

  const moveInbound = async (list: UnifiedLead[], to: AssignTarget): Promise<string | null> => {
    if (list.length > INBOUND_ROTATION_BATCH) return `Inbound leads move ${INBOUND_ROTATION_BATCH} at a time, because each one is a Kylas owner change. Select fewer.`;
    const held = new Map<string, number>();
    for (const l of leads) {
      const m = l.inbound && open(l) ? inboundTeam.find((t) => t.kylasUserId === l.inbound?.ownerId) : undefined;
      if (m) held.set(m.name, (held.get(m.name) || 0) + 1);
    }
    const plan = isRoundRobin(to) ? spreadByLoad(list, to.among, held) : list.map((item) => ({ item, rep: to }));
    const outcome = await reassignInboundLeads(plan.map(({ item, rep }) => ({ leadId: item.id, toPhone: rep.phone || '' })), REASON);
    const byId = new Map(outcome.moved.map((m) => [m.leadId, m]));
    const moved = list.flatMap((l) => {
      const m = byId.get(l.id);
      return m && l.inbound ? [{ ...l.inbound, owner: m.name, ownerId: m.kylasUserId }] : [];
    });
    const saveErr = await upsertInboundLeads(moved.filter(isCrmAddedLead));
    onSaved(moved.map(inboundToUnified));
    if (saveErr) return `Logged, but the new owners of leads added in the CRM were not saved: ${saveErr}. Try again.`;
    if (outcome.failed.length) return `${plural(outcome.moved.length)} moved, ${outcome.failed.length} did not: ${outcome.failed[0].error}`;
    return null;
  };

  const assign = async (to: AssignTarget, team: B2BTeam) => {
    const live = selected.filter((l) => open(l) && (team === 'inbound' ? l.source === 'Inbound' : l.source === 'Outreach'));
    const list = !isRoundRobin(to) && selected.length === 1 ? live : live.filter(noOwner);
    setNote(null);
    if (!list.length) {
      setError(live.length
        ? 'Bulk assignment only takes open leads with no owner. Select one lead on its own and pick One person to move it.'
        : 'None of the selected leads is open on this team, so there is nothing to assign.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await (team === 'inbound' ? moveInbound(list, to) : moveOutreach(list, to))
      .catch((e: unknown) => (e instanceof Error ? e.message : 'Assignment failed'));
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    clear();
    const skipped = selected.length - list.length;
    if (skipped) setNote(`${plural(list.length)} assigned. ${skipped} stayed where ${skipped === 1 ? 'it was' : 'they were'}: closed, lost, on the other team, or already owned.`);
  };

  return {
    picked, toggle, togglePage, pickAll, clear, assign, busy, error, setError, note, setNote, teams,
  };
}
