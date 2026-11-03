'use client';

import { useMemo, useState } from 'react';
import { usePicked } from './use-picked';
import { isOpenStatus } from '../models/inbound';
import { InboundLead } from '../models/mock-data';
import { Rep, spreadByLoad } from '../models/outreach/intake';
import { AssignTarget, AssignTeams, isRoundRobin } from '../ui/assign-bar';
import { moveInboundLeads } from '@/lib/b2b/team';
import { INBOUND_ROTATION_BATCH } from '@/lib/b2b/team/constants';
import type { TeamMember } from '@/lib/b2b/team/types';
import { teamMembers } from '@/lib/b2b/team/utils';

const REASON = 'Reassigned from the Inbound tab';

const plural = (n: number) => `${n} lead${n === 1 ? '' : 's'}`;

export function useInboundReassign({ leads, members, onMoved }: {
  leads: InboundLead[];
  members: TeamMember[];
  onMoved: (moved: InboundLead[]) => void;
}) {
  const { picked, toggle, togglePage, pickAll, clear } = usePicked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const team = useMemo(() => teamMembers(members, 'inbound').filter((m) => m.active), [members]);
  const teams = useMemo<AssignTeams>(() => {
    const rep = (m: TeamMember): Rep => ({ name: m.name, phone: m.phone });
    return { inbound: { reps: team.map(rep), rotation: team.filter((m) => m.inRotation).map(rep) } };
  }, [team]);
  const selected = useMemo(() => leads.filter((l) => picked.has(l.id)), [leads, picked]);

  const assign = async (to: AssignTarget) => {
    const live = selected.filter((l) => isOpenStatus(l.stage));
    if (live.length > INBOUND_ROTATION_BATCH) {
      setError(`Inbound leads move ${INBOUND_ROTATION_BATCH} at a time. Select fewer.`);
      return;
    }
    const held = new Map<string, number>();
    for (const l of leads) {
      const m = isOpenStatus(l.stage) ? team.find((t) => t.kylasUserId === l.ownerId) : undefined;
      if (m) held.set(m.name, (held.get(m.name) || 0) + 1);
    }
    const spread = isRoundRobin(to) ? spreadByLoad(live, to.among, held) : live.map((item) => ({ item, rep: to }));
    const plan = spread.flatMap(({ item, rep }) => {
      const owner = team.find((t) => t.phone === rep.phone);
      return owner && owner.kylasUserId !== item.ownerId ? [{ lead: item, toPhone: owner.phone }] : [];
    });
    setNote(null);
    if (!plan.length) {
      setError(live.length
        ? 'Those leads are already with that person, so nothing moved.'
        : 'None of the selected leads is open, so there is nothing to reassign.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { moved, failed } = await moveInboundLeads(plan, REASON);
      onMoved(moved);
      pickAll(failed.map((f) => f.leadId));
      const stayed = selected.length - plan.length;
      if (stayed) setNote(`${plural(moved.length)} moved. ${stayed} stayed where ${stayed === 1 ? 'it was' : 'they were'}: closed, lost, invalid, or already with that person.`);
      if (failed.length) setError(`${plural(moved.length)} moved, ${failed.length} did not: ${failed[0].error}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reassign failed');
    } finally {
      setBusy(false);
    }
  };

  return {
    picked, toggle, togglePage, clear, assign, busy, error, setError, note, teams,
    selectedCount: selected.length,
    rule: `Open leads only, ${INBOUND_ROTATION_BATCH} at a time. Round robin gives each lead to whoever holds the fewest open leads here.`,
  };
}
