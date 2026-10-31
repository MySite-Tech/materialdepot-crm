import { ticketToOrderRow } from '../../orders/ticket';
import { B2B_BRANCH } from '../constants';
import type { B2BTeam } from '../../team/types';
import type { Holder, NumberBook, OrderBucket, OrderInput, RepTeams, RevenueOrder } from '../types';
import { phoneOf, repName, teamsOfRep } from './book';

const placedBefore = (h: Holder, cartDay: string) => !h.since || !cartDay || cartDay >= h.since;

function directTeam(teams: B2BTeam[], held: Holder[]): B2BTeam | null {
  return held.find((h) => h.team && teams.includes(h.team))?.team ?? teams[0] ?? held.find((h) => h.team)?.team ?? null;
}

export function classifyOrder(
  o: OrderInput,
  bookedOnB2B: boolean,
  book: NumberBook,
  reps: RepTeams,
): RevenueOrder | null {
  const day = String(o.createdAt || '').slice(0, 10);
  const phone = phoneOf(o.clientPhone);
  const held = (book.get(phone) ?? []).filter((h) => placedBefore(h, day));
  const owned = held.find((h) => h.kind !== 'unowned' && h.kind !== 'referred');
  const repTeams = teamsOfRep(o.assignedTo, reps);
  const byB2BRep = o.branch === B2B_BRANCH || repTeams.length > 0;
  const referred = held.find((h) => h.kind === 'referred');

  const shape = (bucket: OrderBucket, team: B2BTeam | null, person: string, from?: Holder): RevenueOrder => ({
    id: o.id,
    bucket,
    team,
    person,
    firm: from?.firm || held.find((h) => h.firm)?.firm || String(o.clientName || '').trim(),
    client: String(o.clientName || '').trim(),
    phone,
    heldBy: from?.kind ?? null,
    ticket: ticketToOrderRow(o, phone),
    placedBy: repName(o.assignedTo),
    store: o.branch || 'Unknown',
    bookedOnB2B,
    redirectLogged: held.some((h) => h.kind === 'redirect'),
    status: o.status,
    value: Number(o.cartValue) || 0,
    day,
  });

  if (referred) return shape('referred', 'kam', referred.owner, referred);
  if (byB2BRep) return shape('direct', directTeam(repTeams, held), repName(o.assignedTo), owned);
  if (owned) return shape('ec', owned.team, owned.owner, owned);
  const unowned = held.find((h) => h.kind === 'unowned');
  if (unowned) return shape('unowned', null, '', unowned);
  return bookedOnB2B ? shape('untraced', null, '') : null;
}
