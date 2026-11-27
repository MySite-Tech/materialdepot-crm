import { ticketToOrderRow } from '../../orders/ticket';
import { B2B_BRANCH } from '../constants';
import type { B2BTeam } from '../../team/types';
import type { BookedOn, Holder, NumberBook, OrderInput, OrderType, RepTeams, RevenueChannel, RevenueOrder } from '../types';
import { phoneOf, repName, repOf } from './book';

const IST_MS = 19_800_000;

const placedBefore = (h: Holder, cartDay: string) => !h.since || !cartDay || cartDay >= h.since;

function directTeam(teams: B2BTeam[], held: Holder[]): B2BTeam | null {
  return held.find((h) => h.team && teams.includes(h.team))?.team ?? teams[0] ?? held.find((h) => h.team)?.team ?? null;
}

const RECORD_KINDS = new Set<Holder['kind']>(['firm', 'outreach', 'inbound']);

const samePerson = (a: string, b: string) => repName(a).toLowerCase() === repName(b).toLowerCase();

const heldAtOrder = (h: Holder, orderMs: number) =>
  h.kind !== 'firm' || !h.kamFrom || Number.isNaN(orderMs) || Date.parse(h.kamFrom) <= orderMs;

const asOfOrder = (h: Holder, orderMs: number): Holder =>
  h.kind !== 'firm' || !h.kamSince || Number.isNaN(orderMs) || Date.parse(h.kamSince) <= orderMs
    ? h
    : { ...h, kind: 'unowned', team: null, owner: '' };

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
): RevenueOrder | null {
  const cartDay = String(o.createdAt || '').slice(0, 10);
  const bookedOnB2B = booked !== 'store';
  const phone = phoneOf(o.clientPhone);
  const orderMs = Date.parse(String(o.orderPlacedAt || o.createdAt || ''));
  const orderDay = Number.isNaN(orderMs) ? cartDay : new Date(orderMs + IST_MS).toISOString().slice(0, 10);
  const held = (book.get(phone) ?? []).filter((h) => placedBefore(h, cartDay)).map((h) => asOfOrder(h, orderMs));
  const owned = held.find((h) => h.kind !== 'unowned' && h.kind !== 'referred');
  const rep = repOf(o.assignedTo, reps, orderDay);
  const repTeams = rep?.teams ?? [];
  const placedBy = rep?.name ?? repName(o.assignedTo);
  const byB2BRep = repTeams.length > 0 || (!rep?.dated && o.branch === B2B_BRANCH);
  const referred = held.find((h) => h.kind === 'referred');

  const channelOf = (type: OrderType): RevenueChannel =>
    type === 5 ? 'referred' : bookedOnB2B ? 'direct' : type === 8 ? 'ecDirect' : 'redirected';

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
  if (owned) return shape(bookedOnB2B ? 3 : 4, owned.team, owned.owner, owned);
  const unowned = held.find((h) => h.kind === 'unowned');
  if (unowned) return shape(bookedOnB2B ? 6 : 8, null, '', unowned);
  return booked === 'branch' ? shape(7, null, '') : null;
}
