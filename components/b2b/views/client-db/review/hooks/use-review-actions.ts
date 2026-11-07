'use client';

import type { ClientEntity } from '../../../../models/client';
import { isOpenStatus } from '../../../../models/inbound';
import { assignFirm, planFirmRoundRobin } from '../../../../models/kam';
import { Rep, assignLead, planRoundRobin, spreadByLoad } from '../../../../models/outreach/intake';
import { withJourney } from '../../../../models/outreach/reminders';
import { useB2BReps } from '../../../../hooks/use-b2b-reps';
import { usePicked } from '../../../../hooks/use-picked';
import { AssignTarget, AssignTeams, isRoundRobin } from '../../../../ui/assign-bar';
import { fetchInboundBoard, fetchOutreachLeads, insertInboundLeads, istToday, upsertClients, upsertOutreachLeads } from '@/lib/b2b';
import { markNotClient, reviewToClient, reviewToInbound, reviewToOutreach, undoNotClient } from '@/lib/b2b/client-import';
import type { RejectedFirm, ReviewFirm } from '@/lib/b2b/client-import/types';
import type { B2BTeam, B2BTeamLoad } from '@/lib/b2b/team/types';
import { useMemo, useState } from 'react';

const firms = (n: number) => `${n} firm${n === 1 ? '' : 's'}`;

const names = (reps: Rep[]) => [...new Set(reps.map((r) => r.name))].join(', ');

export function useReviewActions({ list, clients, team, by, onClients, settle, restore }: {
  list: ReviewFirm[];
  clients: ClientEntity[];
  team: B2BTeamLoad;
  by: string;
  onClients: (added: ClientEntity[]) => void;
  settle: (keys: string[], rejected?: RejectedFirm[]) => void;
  restore: (key: string) => void;
}) {
  const { picked, toggle, togglePage, pickAll, clear } = usePicked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { reps, rotationReps, kams, allKams } = useB2BReps(team);

  const inboundTeam = useMemo(() => team.members
    .filter((m) => m.team === 'inbound' && m.active && m.kylasUserId != null)
    .sort((a, b) => a.name.localeCompare(b.name)), [team.members]);
  const teams = useMemo<AssignTeams>(() => {
    const rep = (m: { name: string; phone: string }): Rep => ({ name: m.name, phone: m.phone });
    return {
      inbound: { reps: inboundTeam.map(rep), rotation: inboundTeam.filter((m) => m.inRotation).map(rep) },
      outreach: { reps, rotation: rotationReps },
      kam: { reps: allKams, rotation: kams },
    };
  }, [inboundTeam, reps, rotationReps, allKams, kams]);

  const selected = useMemo(() => list.filter((f) => picked.has(f.key)), [list, picked]);

  const run = async (work: (chosen: ReviewFirm[], at: string) => Promise<string>) => {
    if (!selected.length || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await work(selected, new Date().toISOString()));
      clear();
    } catch (e) {
      setError(`Nothing was sent: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveClients = async (next: ClientEntity[]) => {
    const err = await upsertClients(next);
    if (err) throw new Error(err);
    onClients(next);
  };

  const toKam = async (chosen: ReviewFirm[], to: AssignTarget, at: string) => {
    const fresh = chosen.map((f) => reviewToClient(f, by, at));
    const plan = isRoundRobin(to) ? planFirmRoundRobin(fresh, to.among, clients) : fresh.map((item) => ({ item, rep: to }));
    await saveClients(plan.map(({ item, rep }) => assignFirm(item, rep, by, at, isRoundRobin(to) ? 'round-robin' : 'manual')));
    return `${firms(plan.length)} added to the Client Database for ${names(plan.map((p) => p.rep))}. Each waits on the KAM tab until that KAM accepts it.`;
  };

  const toOutreach = async (chosen: ReviewFirm[], to: AssignTarget, at: string) => {
    const leads = chosen.map((f) => reviewToOutreach(f, by, at));
    const plan = isRoundRobin(to)
      ? planRoundRobin(leads, to.among, await fetchOutreachLeads(), istToday().slice(0, 7))
      : leads.map((item) => ({ item, rep: to }));
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    const err = await upsertOutreachLeads(plan.map(({ item, rep }) => withJourney(item, assignLead(item, rep, by, at, how), by, at)), { onlyNew: true });
    if (err) throw new Error(err);
    return `${firms(plan.length)} sent to Outreach for ${names(plan.map((p) => p.rep))}. Each BM accepts or rejects the lead on Outreach.`;
  };

  const toInbound = async (chosen: ReviewFirm[], to: AssignTarget, at: string) => {
    const board = isRoundRobin(to) ? await fetchInboundBoard() : null;
    if (board && !board.ok) throw new Error('Inbound leads could not be read, so the round robin could not be worked out');
    const held = new Map<string, number>();
    for (const l of board?.leads ?? []) {
      const m = isOpenStatus(l.stage) ? inboundTeam.find((t) => t.kylasUserId === l.ownerId) : undefined;
      if (m) held.set(m.name, (held.get(m.name) || 0) + 1);
    }
    const plan = isRoundRobin(to) ? spreadByLoad(chosen, to.among, held) : chosen.map((item) => ({ item, rep: to }));
    const leads = plan.map(({ item, rep }) => {
      const m = inboundTeam.find((t) => t.phone === rep.phone)!;
      return reviewToInbound(item, { name: m.name, kylasUserId: m.kylasUserId! }, by, at);
    });
    const err = await insertInboundLeads(leads);
    if (err) throw new Error(err);
    return `${firms(leads.length)} added to Inbound as new leads for ${names(plan.map((p) => p.rep))}.`;
  };

  const assign = (to: AssignTarget, team: B2BTeam) => run(async (chosen, at) => {
    const done = await (team === 'kam' ? toKam(chosen, to, at) : team === 'outreach' ? toOutreach(chosen, to, at) : toInbound(chosen, to, at));
    settle(chosen.map((f) => f.key));
    return done;
  });

  const addToClientDb = () => run(async (chosen, at) => {
    await saveClients(chosen.map((f) => reviewToClient(f, by, at)));
    settle(chosen.map((f) => f.key));
    return `${firms(chosen.length)} added to the Client Database with no KAM. Assign them from the Firms list when a KAM should own them.`;
  });

  const notClient = () => run(async (chosen, at) => {
    await markNotClient(chosen, by);
    settle(chosen.map((f) => f.key), chosen.map((f) => ({
      ...f,
      decision: { key: f.key, firm: f.name, gstins: f.gstins, phones: f.contacts.map((c) => c.number), decided_by: by, decided_at: at },
    })));
    return `${firms(chosen.length)} marked Not a client. They stay off this list, and Undo under Not a client brings one back.`;
  });

  const undo = async (key: string) => {
    setError(null);
    setNote(null);
    try {
      await undoNotClient(key);
      restore(key);
    } catch (e) {
      setError(`Undo failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    picked, toggle, togglePage, pickAll, clear, teams, busy, error, setError, note, setNote,
    assign, addToClientDb, notClient, undo,
  };
}
