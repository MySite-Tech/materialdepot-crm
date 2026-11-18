import { normalisePhone } from '@/lib/org/utils';
import { ClientContact, ClientEntity, KamAssignment, clientTypeFromLead, contactNumbers, normalizeContactNumber, normalizeGst } from '../../client';
import { newB2BId } from '../../ids';
import { OutreachLead } from '../../mock-data';
import { HANDOVER_TAT_HOURS, hoursSince, sameRep } from '../../outreach/handover';
import { Rep, spreadByLoad } from '../../outreach/intake';

export type FirmHandoverState = 'pending' | 'overdue' | 'accepted' | 'rejected' | 'none';

export const latestAssignment = (c: ClientEntity): KamAssignment | undefined =>
  [...(c.assignments || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];

export function currentAssignments(c: ClientEntity): KamAssignment[] {
  const mergedAt = (c.mergedFrom || []).map((m) => String(m.mergedAt || '')).sort().pop();
  return (c.assignments || []).filter((a) => !mergedAt || String(a.at) >= mergedAt);
}

export function firmHandover(c: ClientEntity): KamAssignment | undefined {
  const a = [...currentAssignments(c)].sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
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

export const ownsFirm = (c: ClientEntity, me: Rep): boolean => {
  if (!c.kam) return false;
  const a = latestAssignment(c);
  if (a?.kamPhone && me.phone && sameRep(a.kam, c.kam)) return a.kamPhone === me.phone;
  return sameRep(c.kam, me.name);
};

export function assignFirm(c: ClientEntity, rep: Rep, by: string, at: string, how: 'manual' | 'round-robin', reason?: string): ClientEntity {
  const entry: KamAssignment = {
    kam: rep.name, kamPhone: rep.phone, at, by, how, status: 'Pending',
    reason: reason ?? (how === 'round-robin' ? 'Assigned round robin by an admin' : 'Assigned by an admin'),
  };
  return { ...c, kam: rep.name, assignments: [...(c.assignments || []), entry] };
}

export function acceptFirmHandover(c: ClientEntity, by: string, at: string): ClientEntity {
  const h = firmHandover(c);
  if (!h || h.status !== 'Pending') return c;
  const answered: KamAssignment = { ...h, status: 'Accepted', respondedAt: at, respondedBy: by };
  return { ...c, assignments: (c.assignments || []).map((a) => (a === h ? answered : a)) };
}

export function rejectFirmHandover(c: ClientEntity, by: string, at: string, reason: string): ClientEntity {
  const h = firmHandover(c);
  if (!h || h.status !== 'Pending') return c;
  const answered: KamAssignment = { ...h, status: 'Rejected', respondedAt: at, respondedBy: by, rejectReason: reason };
  const previous = (c.assignments || [])
    .filter((a) => a !== h && (!a.status || a.status === 'Accepted') && String(a.at) < String(h.at) && !sameRep(a.kam, h.kam))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .pop();
  return { ...c, kam: previous?.kam || undefined, assignments: (c.assignments || []).map((a) => (a === h ? answered : a)) };
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

const exactName = (v: string | undefined) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function firmForOutreachHandover(l: OutreachLead, clients: ClientEntity[], at: string): { firm: ClientEntity; isNew: boolean } | null {
  const h = l.handover;
  if (!h || h.status !== 'Accepted') return null;
  const people: ClientContact[] = [];
  for (const [number, name] of [[l.phone, l.contactPerson], [l.altPhone, l.altName], ...(l.contacts || []).map((c) => [c.phone, c.name])]) {
    const n = normalizeContactNumber(number);
    if (n.length === 10 && !people.some((p) => p.number === n)) people.push({ number: n, name: String(name || '').trim() || undefined });
  }
  const phones = people.map((p) => p.number);
  const gst = normalizeGst(l.gstNumber);
  const name = exactName(l.company);
  const hit = clients.find((c) => contactNumbers(c.contacts).some((p) => phones.includes(p)))
    || (gst ? clients.find((c) => c.gsts.some((g) => normalizeGst(g.number) === gst)) : undefined)
    || (name ? clients.find((c) => exactName(c.company) === name) : undefined);
  const entry: KamAssignment = {
    kam: h.kam, kamPhone: h.kamPhone, at, by: h.sentBy, how: 'manual', status: 'Accepted',
    respondedAt: h.respondedAt || at, respondedBy: h.respondedBy, reason: `Outreach handover from ${l.bm}`,
  };
  if (!hit) {
    return {
      isNew: true,
      firm: {
        id: newB2BId('CLI'),
        company: l.company.trim(),
        contacts: people.map((p, i) => ({ ...p, primary: i === 0 })),
        gsts: gst ? [{ number: gst }] : [],
        segment: l.segment,
        clientType: clientTypeFromLead(l.companyType),
        clientTypeRaw: clientTypeFromLead(l.companyType) ? undefined : l.companyType,
        source: 'Outreach',
        kam: h.kam,
        assignments: [entry],
        interactions: [],
        escalations: [],
        createdAt: at,
        updatedAt: at,
      },
    };
  }
  const known = contactNumbers(hit.contacts);
  const added = people.filter((p) => !known.includes(p.number));
  const held = sameRep(hit.kam, h.kam) && firmHandover(hit)?.status !== 'Pending';
  if (held && !added.length) return null;
  return {
    isNew: false,
    firm: {
      ...hit,
      contacts: [...hit.contacts, ...added],
      ...(held ? {} : { kam: h.kam, assignments: [...(hit.assignments || []), entry] }),
    },
  };
}

export const canRespondToFirm =(c: ClientEntity, me: Rep, isManager: boolean, teamLive: boolean): boolean => {
  const h = firmHandover(c);
  if (!h || h.status !== 'Pending') return false;
  if (isManager || !teamLive) return true;
  return h.kamPhone && me.phone ? normalisePhone(h.kamPhone) === normalisePhone(me.phone) : sameRep(h.kam, me.name);
};
