'use client';

import { ClientEntity, ClientOrderMetrics, ClientStatus, SpocLogEntry, contactNumbers } from '../../../models/client';
import { isOpenStatus, openLeadLoad } from '../../../models/inbound';
import { assignFirm, planFirmRoundRobin } from '../../../models/kam';
import { OUTREACH_OPEN_STATUSES } from '../../../models/outreach';
import { sameRep } from '../../../models/outreach/handover';
import { Rep, assignLead, planRoundRobin, spreadByLoad } from '../../../models/outreach/intake';
import { withJourney } from '../../../models/outreach/reminders';
import { useAssignTeams } from '../../../hooks/use-assign-teams';
import { usePicked } from '../../../hooks/use-picked';
import { AssignTarget, isRoundRobin } from '../../../ui/assign-bar';
import { fetchInboundBoard, fetchOutreachLeads, inboundPhones, insertInboundLeads, istToday, outreachPhones, upsertClients, upsertOutreachLeads } from '@/lib/b2b';
import { firmSendSummary, firmToInbound, firmToOutreach } from '@/lib/b2b/client-import';
import type { B2BTeam, B2BTeamLoad } from '@/lib/b2b/team/types';
import { useMemo, useState } from 'react';

type LeadTeam = Exclude<B2BTeam, 'kam'>;

const LABEL: Record<LeadTeam, string> = { inbound: 'Inbound', outreach: 'Outreach' };

const firms = (n: number) => `${n} firm${n === 1 ? '' : 's'}`;

const names = (reps: Rep[]) => [...new Set(reps.map((r) => r.name))].join(', ');

export function useFirmAssign({ clients, team, by, rowOf, onSaved }: {
  clients: ClientEntity[];
  team: B2BTeamLoad;
  by: string;
  rowOf: (c: ClientEntity) => { metrics: ClientOrderMetrics; status: ClientStatus };
  onSaved: (list: ClientEntity[]) => void;
}) {
  const { picked, toggle, togglePage, pickAll, clear } = usePicked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { teams: all, inboundTeam } = useAssignTeams(team);

  const selected = useMemo(() => clients.filter((c) => picked.has(c.id)), [clients, picked]);
  const withNumber = useMemo(() => selected.filter((c) => contactNumbers(c.contacts).length > 0), [selected]);

  const toKam = async (to: AssignTarget) => {
    if (!isRoundRobin(to) && selected.length === 1 && sameRep(selected[0].kam, to.name)) {
      setError(`${selected[0].company} is already with ${to.name}.`);
      return;
    }
    const chosen = !isRoundRobin(to) && selected.length === 1 ? selected : selected.filter((c) => !c.kam);
    const skipped = selected.length - chosen.length;
    if (!chosen.length) {
      setError('Every selected firm already has a KAM. Bulk assignment only takes firms with no KAM. Select one firm on its own and pick One person to move it.');
      return;
    }
    const at = new Date().toISOString();
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    const plan = isRoundRobin(to) ? planFirmRoundRobin(chosen, to.among, clients) : chosen.map((item) => ({ item, rep: to }));
    const next = plan.map(({ item, rep }) => assignFirm(item, rep, by, at, how));
    const err = await upsertClients(next);
    if (err) {
      setError(`Nothing was assigned: ${err}`);
      return;
    }
    onSaved(next);
    clear();
    if (skipped) setNote(`${firms(chosen.length)} assigned. ${skipped} already had a KAM and stayed where ${skipped === 1 ? 'it was' : 'they were'}. Move an owned firm by selecting it on its own.`);
  };

  const sendLeads = async (to: AssignTarget, t: LeadTeam, at: string) => {
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    const summary = (c: ClientEntity) => { const r = rowOf(c); return firmSendSummary(c, r.metrics, r.status, by); };
    const freeOf = (held: Set<string>) => withNumber.filter((c) => !contactNumbers(c.contacts).some((p) => held.has(p)));
    if (t === 'outreach') {
      const leads = await fetchOutreachLeads();
      const held = new Set(leads.filter((l) => OUTREACH_OPEN_STATUSES.includes(l.status) && !l.intake?.rejectedAt).flatMap(outreachPhones));
      const free = freeOf(held);
      const plan = isRoundRobin(to) ? planRoundRobin(free, to.among, leads, istToday().slice(0, 7)) : free.map((item) => ({ item, rep: to }));
      const err = await upsertOutreachLeads(plan.map(({ item, rep }) => {
        const lead = firmToOutreach(item, summary(item), by, at);
        return withJourney(lead, assignLead(lead, rep, by, at, how), by, at);
      }), { onlyNew: true });
      if (err) throw new Error(err);
      return plan;
    }
    const board = await fetchInboundBoard();
    if (!board.ok) throw new Error('Inbound leads could not be read, so no firm was checked for an open lead');
    const held = new Set(board.leads.filter((l) => isOpenStatus(l.stage)).flatMap(inboundPhones));
    const free = freeOf(held);
    const plan = isRoundRobin(to) ? spreadByLoad(free, to.among, openLeadLoad(board.leads, inboundTeam)) : free.map((item) => ({ item, rep: to }));
    const err = await insertInboundLeads(plan.map(({ item, rep }) => {
      const m = inboundTeam.find((x) => x.phone === rep.phone)!;
      return firmToInbound(item, summary(item), { name: m.name, kylasUserId: m.kylasUserId! }, by, at);
    }));
    if (err) throw new Error(err);
    return plan;
  };

  const toTeam = async (to: AssignTarget, t: LeadTeam) => {
    if (!withNumber.length) {
      setError(`None of the selected firms has a phone number, so none can become a ${LABEL[t]} lead. Add one on the Firm page.`);
      return;
    }
    const at = new Date().toISOString();
    const plan = await sendLeads(to, t, at);
    const noNumber = selected.length - withNumber.length;
    const busyElsewhere = withNumber.length - plan.length;
    const skips = [
      noNumber ? `${firms(noNumber)} had no phone number and stayed put` : '',
      busyElsewhere ? `${firms(busyElsewhere)} already had an open ${LABEL[t]} lead on ${busyElsewhere === 1 ? 'its' : 'their'} numbers, so ${busyElsewhere === 1 ? 'it was' : 'they were'} left there` : '',
    ].filter(Boolean).join('. ');
    if (!plan.length) {
      setError(`Nothing was sent. ${skips}.`);
      return;
    }
    const today = istToday();
    const next = plan.map(({ item, rep }) => {
      const entry: SpocLogEntry = { role: t, name: rep.name, from: today, at, by };
      return { ...item, spocLog: [...(item.spocLog || []), entry] };
    });
    const err = await upsertClients(next);
    if (err) {
      setError(`${firms(plan.length)} went to ${LABEL[t]} as new leads, but the firms' ${LABEL[t]} SPoC could not be saved: ${err}. Set it on each Firm page.`);
      clear();
      return;
    }
    onSaved(next);
    clear();
    const after = t === 'outreach' ? 'Each BM accepts or rejects the lead on Outreach.' : 'Each is a new lead on Inbound, owned at once.';
    setNote(`${firms(plan.length)} sent to ${LABEL[t]} for ${names(plan.map((p) => p.rep))}, who is now ${plan.length === 1 ? 'the firm' : 'each firm'}'s ${LABEL[t]} SPoC. ${after} The KAM stays as it was.${skips ? ` ${skips}.` : ''}`);
  };

  const assign = async (to: AssignTarget, t: B2BTeam) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (t === 'kam') await toKam(to);
      else await toTeam(to, t);
    } catch (e) {
      setError(`Nothing was sent: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return { picked, toggle, togglePage, pickAll, clear, teams: all, assign, busy, error, setError, note, setNote };
}
