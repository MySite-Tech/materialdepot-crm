import { ticketToOrderRow } from '../../orders/ticket';
import { B2B_BRANCH } from '../constants';
import type { B2BTeam } from '../../team/types';
import type { BookedOn, FirmIndex, FirmGroups, Holder, NumberBook, OrderInput, OrderType, RepTeams, RevenueChannel, RevenueOrder, Touch } from '../types';
import { firmKey, phoneOf, repName, repOf } from './book';

const IST_MS = 19_800_000;

const placedBefore = (h: Holder, cartDay: string) => !h.since || !cartDay || cartDay >= h.since;

function directTeam(teams: B2BTeam[], held: Holder[]): B2BTeam | null {
  return held.find((h) => h.team && teams.includes(h.team))?.team ?? teams[0] ?? held.find((h) => h.team)?.team ?? null;
}

const RECORD_KINDS = new Set<Holder['kind']>(['firm', 'outreach', 'inbound']);

const samePerson = (a: string, b: string) => repName(a).toLowerCase() === repName(b).toLowerCase();

const heldAtOrder = (h: Holder, orderMs: number) =>
  h.kind !== 'firm' || !h.kamFrom || Number.isNaN(orderMs) || Date.parse(h.kamFrom) <= orderMs;

function asOfOrder(h: Holder, orderMs: number): Holder {
  if (!h.kamSince || Number.isNaN(orderMs) || Date.parse(h.kamSince) <= orderMs) return h;
  if (h.kind === 'firm') return { ...h, kind: 'unowned', team: null, owner: '' };
  return h.kind === 'studio' ? { ...h, owner: '' } : h;
}

function orderFacts(o: OrderInput, reps: RepTeams) {
  const orderMs = Date.parse(String(o.orderPlacedAt || o.createdAt || ''));
  const cartDay = String(o.createdAt || '').slice(0, 10);
  const orderDay = Number.isNaN(orderMs) ? cartDay : new Date(orderMs + IST_MS).toISOString().slice(0, 10);
  const rep = repOf(o.assignedTo, reps, orderDay);
  const repTeams = rep?.teams ?? [];
  const byB2BRep = repTeams.length > 0 || (!rep?.dated && o.branch === B2B_BRANCH);
  const movedToStore = !!rep?.dated && repTeams.length > 0 && !!o.branch && o.branch !== B2B_BRANCH;
  return { orderMs, cartDay, orderDay, rep, repTeams, byB2BRep, movedToStore, placedBy: rep?.name ?? repName(o.assignedTo) };
}

export function buildTouches(orders: OrderInput[], reps: RepTeams, groups: FirmGroups): Map<string, Touch[]> {
  const out = new Map<string, Touch[]>();
  for (const o of orders) {
    const phone = phoneOf(o.clientPhone);
    const f = orderFacts(o, reps);
    if (!phone || !f.byB2BRep || !f.orderDay) continue;
    const key = firmKey(groups, phone);
    const list = out.get(key) ?? [];
    list.push({ day: f.orderDay, person: f.placedBy, team: f.repTeams[0] ?? null });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

function lastTouch(list: Touch[] | undefined, day: string): Touch | null {
  let last: Touch | null = null;
  for (const t of list ?? []) if (t.day <= day) last = t;
  return last;
}

export function teammateRecordOwner(held: Holder[], repTeams: B2BTeam[], placedBy: string, orderAt: string): Holder | null {
  const orderMs = Date.parse(orderAt);
  const records = held.filter((h) => RECORD_KINDS.has(h.kind) && h.owner && h.team && heldAtOrder(h, orderMs));
  if (records.some((h) => samePerson(h.owner, placedBy))) return null;
  return records.find((h) => repTeams.includes(h.team!)) ?? null;
}

export function classifyOrder(
  o: OrderInput,
  booked: BookedOn,
  book: NumberBook,
  reps: RepTeams,
  firms: FirmIndex,
): RevenueOrder | null {
  const phone = phoneOf(o.clientPhone);
  const { orderMs, cartDay, orderDay, repTeams, byB2BRep, movedToStore, placedBy } = orderFacts(o, reps);
  const bookedOnB2B = booked !== 'store' || movedToStore;
  const held = (book.get(phone) ?? []).filter((h) => placedBefore(h, cartDay)).map((h) => asOfOrder(h, orderMs));
  const owned = held.find((h) => h.kind !== 'unowned' && h.kind !== 'referred');
  const referred = held.find((h) => h.kind === 'referred');
  const key = firmKey(firms.groups, phone);
  const touch = phone ? lastTouch(firms.touches.get(key), orderDay) : null;
  const creditable = (t: Touch) => ((repOf(t.person, reps, orderDay)?.teams.length ?? 0) > 0 ? t.person : '');

  const channelOf = (type: OrderType): RevenueChannel =>
    type === 5 ? 'referred' : type === 1 ? 'direct' : type === 8 ? 'ecDirect' : 'redirected';

  const shape = (type: OrderType, team: B2BTeam | null, person: string, from?: Holder): RevenueOrder => ({
    id: o.id,
    channel: channelOf(type),
    type,
    team,
    person,
    firm: from?.firm || held.find((h) => h.firm)?.firm || String(o.clientName || '').trim(),
    client: String(o.clientName || '').trim(),
    phone,
    heldBy: from?.kind ?? null,
    ticket: ticketToOrderRow(o, phone),
    placedBy,
    store: byB2BRep ? B2B_BRANCH : o.branch || 'Unknown',
    bookedOnB2B,
    redirectLogged: held.some((h) => h.kind === 'redirect'),
    status: o.status,
    value: Number(o.cartValue) || 0,
  });

  if (referred) return shape(5, referred.team ?? 'kam', referred.owner, referred);
  if (byB2BRep) {
    const recordOwner = teammateRecordOwner(held, repTeams, placedBy, String(o.orderPlacedAt || o.createdAt || ''));
    return recordOwner
      ? shape(bookedOnB2B ? 1 : 2, recordOwner.team, recordOwner.owner, recordOwner)
      : shape(bookedOnB2B ? 1 : 2, directTeam(repTeams, held), placedBy, owned);
  }
  if (owned) return owned.owner || !touch ? shape(4, owned.team, owned.owner, owned) : shape(4, touch.team, creditable(touch), owned);
  if (touch) return shape(4, touch.team, creditable(touch), { kind: 'b2bOrder', team: touch.team, owner: touch.person, firm: '', since: touch.day });
  const unowned = held.find((h) => h.kind === 'unowned');
  return unowned || firms.groups.known.has(key) ? shape(8, null, '', unowned) : null;
}
