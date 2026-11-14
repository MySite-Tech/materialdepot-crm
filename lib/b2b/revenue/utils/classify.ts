import { ticketToOrderRow } from '../../orders/ticket';
import { B2B_BRANCH } from '../constants';
import type { B2BTeam } from '../../team/types';
import type { BookedOn, Holder, NumberBook, OrderInput, OrderType, RepTeams, RevenueChannel, RevenueOrder } from '../types';
import { phoneOf, repName, repOf } from './book';

const placedBefore = (h: Holder, cartDay: string) => !h.since || !cartDay || cartDay >= h.since;

function directTeam(teams: B2BTeam[], held: Holder[]): B2BTeam | null {
  return held.find((h) => h.team && teams.includes(h.team))?.team ?? teams[0] ?? held.find((h) => h.team)?.team ?? null;
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
  const held = (book.get(phone) ?? []).filter((h) => placedBefore(h, cartDay));
  const owned = held.find((h) => h.kind !== 'unowned' && h.kind !== 'referred');
  const rep = repOf(o.assignedTo, reps);
  const repTeams = rep?.teams ?? [];
  const placedBy = rep?.name ?? repName(o.assignedTo);
  const byB2BRep = o.branch === B2B_BRANCH || repTeams.length > 0;
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
    store: o.branch || 'Unknown',
    bookedOnB2B,
    redirectLogged: held.some((h) => h.kind === 'redirect'),
    status: o.status,
    value: Number(o.cartValue) || 0,
  });

  if (referred) return shape(5, 'kam', referred.owner, referred);
  if (byB2BRep) return shape(bookedOnB2B ? 1 : 2, directTeam(repTeams, held), placedBy, owned);
  if (owned) return shape(bookedOnB2B ? 3 : 4, owned.team, owned.owner, owned);
  const unowned = held.find((h) => h.kind === 'unowned');
  if (unowned) return shape(bookedOnB2B ? 6 : 8, null, '', unowned);
  return booked === 'branch' ? shape(7, null, '') : null;
}
