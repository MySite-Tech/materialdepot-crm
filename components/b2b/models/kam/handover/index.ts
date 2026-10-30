import { ClientEntity, KamAssignment } from '../../client';
import { HANDOVER_TAT_HOURS, hoursSince, sameRep } from '../../outreach/handover';
import { Rep, spreadByLoad } from '../../outreach/intake';

export type FirmHandoverState = 'pending' | 'overdue' | 'accepted' | 'rejected' | 'none';

export const FIRM_HANDOVER_REJECT_REASONS = [
  'Outside my area',
  'At capacity',
  'Another KAM already handles this firm',
  'Firm details incomplete or wrong',
] as const;

export const latestAssignment = (c: ClientEntity): KamAssignment | undefined =>
  [...(c.assignments || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];

export function firmHandover(c: ClientEntity): KamAssignment | undefined {
  const a = latestAssignment(c);
  return a?.status ? a : undefined;
}

export function firmHandoverState(c: ClientEntity, nowMs: number): FirmHandoverState {
  const h = firmHandover(c);
  if (!h) return 'none';
  if (h.status === 'Accepted') return 'accepted';
  if (h.status === 'Rejected') return 'rejected';
  return hoursSince(h.at, nowMs) > HANDOVER_TAT_HOURS ? 'overdue' : 'pending';
}

export const firmHandoverPending = (c: ClientEntity): boolean => firmHandover(c)?.status === 'Pending';

export const canRejectFirm = (c: ClientEntity): boolean => !firmHandover(c)?.movedFrom;

const heldBy = (c: ClientEntity): string | undefined => {
  const h = firmHandover(c);
  return h?.status === 'Pending' ? h.movedFrom : c.kam;
};

export function assignFirm(c: ClientEntity, rep: Rep, by: string, at: string, how: 'manual' | 'round-robin', reason?: string): ClientEntity {
  const entry: KamAssignment = {
    kam: rep.name, kamPhone: rep.phone, at, by, how, status: 'Pending',
    reason: reason ?? (how === 'round-robin' ? 'Assigned round robin by an admin' : 'Assigned by an admin'),
    movedFrom: heldBy(c),
  };
  return { ...c, kam: rep.name, assignments: [...(c.assignments || []), entry] };
}

export function respondFirmHandover(c: ClientEntity, by: string, at: string, rejectReason?: string): ClientEntity {
  const h = firmHandover(c);
  if (!h || h.status !== 'Pending' || (rejectReason && h.movedFrom)) return c;
  const answered: KamAssignment = rejectReason
    ? { ...h, status: 'Rejected', respondedAt: at, respondedBy: by, rejectReason }
    : { ...h, status: 'Accepted', respondedAt: at, respondedBy: by };
  return {
    ...c,
    kam: rejectReason ? undefined : c.kam,
    assignments: (c.assignments || []).map((a) => (a === h ? answered : a)),
  };
}

export function planFirmRoundRobin(firms: ClientEntity[], kams: Rep[], all: ClientEntity[]): { item: ClientEntity; rep: Rep }[] {
  const moving = new Set(firms.map((f) => f.id));
  const load = new Map<string, number>();
  for (const c of all) {
    if (moving.has(c.id) || !c.kam) continue;
    const rep = kams.find((k) => sameRep(k.name, c.kam));
    if (rep) load.set(rep.name, (load.get(rep.name) || 0) + 1);
  }
  return spreadByLoad(firms, kams, load);
}

export const canRespondToFirm = (c: ClientEntity, me: Rep, isManager: boolean, teamLive: boolean): boolean => {
  const h = firmHandover(c);
  if (!h || h.status !== 'Pending') return false;
  if (isManager || !teamLive) return true;
  return h.kamPhone && me.phone ? h.kamPhone === me.phone : sameRep(h.kam, me.name);
};
