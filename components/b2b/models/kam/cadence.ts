import { ClientEntity, ClientOrderMetrics, LONG_INACTIVE, StudioReferral, clientStatus, currentTemperature, daysToLapse, firmDetailGaps, latestInteraction, nextFollowUp, normalizeContactNumber, primaryContact, temperatureBand, ticketFollowUps } from '../client';
import { daysUntil, followUpBucket, istToday } from '../inbound';
import type { FollowUpBucket } from '../inbound';
import { DAILY_CALL_TARGET, TEMPERATURE_SILENCE_DAYS } from '../../constants/kam';
import { AssignedClientRow, CallCompliance, KamDealLens, KamFirmLens, KamReferralLens, KamReferralRow, KamTicketRow, ReferralStage, TemperatureMismatch } from '../../types/kam';
import type { ClientOrderHistory } from '@/lib/b2b/orders/history';
import type { CrmReferral } from '@/lib/b2b/referrals/types';
import type { LeadDeals, OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { dealPhone, leadDeals } from '@/lib/b2b/inbound-deals/utils';
import { firmHandover, firmHandoverPending } from './handover';
import { sameRep } from '../outreach/handover';

export const calledOn = (c: ClientEntity, day: string): boolean =>
  (c.interactions || []).some((i) => i.type === 'Call' && String(i.date || '').slice(0, 10) === day);

export const firmFollowUp = (c: ClientEntity, today: string) => followUpBucket(nextFollowUp(c.interactions)?.date, today);

export function callsLoggedOn(
  clients: ClientEntity[],
  kam: string,
  day: string,
): number {
  return clients.filter((c) => sameRep(c.kam, kam) && calledOn(c, day)).length;
}

export function callCompliance(
  clients: ClientEntity[],
  kams: string[],
  today: string = istToday(),
): CallCompliance[] {
  return kams.map((kam) => {
    const mine = clients.filter((c) => sameRep(c.kam, kam));
    return {
      kam,
      logged: callsLoggedOn(clients, kam, today),
      target: DAILY_CALL_TARGET,
      overdueFollowUps: mine.filter((c) => firmFollowUp(c, today) === 'overdue').length,
      dueToday: mine.filter((c) => firmFollowUp(c, today) === 'today').length,
    };
  });
}

const NO_DEALS: LeadDeals = { carts: [], pis: [] };

export function assignedClientRows(
  clients: ClientEntity[],
  metricsFor: (c: ClientEntity) => ClientOrderMetrics,
  today: string = istToday(),
  ticketsFor: (c: ClientEntity) => OpenDeal[] = () => [],
): AssignedClientRow[] {
  return clients.map((client) => {
    const metrics = metricsFor(client);
    const temp = currentTemperature(client.interactions);
    const scored = (client.interactions || []).filter((i) => typeof i.temperature === 'number');
    const prev = scored.length > 1
      ? [...scored].sort((a, b) => String(b.date).localeCompare(String(a.date)))[1].temperature
      : undefined;
    const last = latestInteraction(client.interactions);
    const next = nextFollowUp(client.interactions);
    const primary = primaryContact(client.contacts);
    const upcoming = [...(client.interactions || [])]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .find((i) => String(i.upcomingProject || '').trim());
    return {
      client,
      company: client.company,
      source: client.source,
      contactPerson: String(primary?.name || '').trim(),
      contactNumber: primary?.number || '',
      metrics,
      status: clientStatus(metrics, today),
      segment: client.segment,
      temperature: temp?.value,
      temperatureAt: temp?.at,
      temperatureBand: temperatureBand(temp?.value),
      previousTemperature: prev,
      upcomingProject: upcoming?.upcomingProject,
      nextFollowUpDate: next?.date,
      nextFollowUpTime: next?.time,
      followUpFor: next?.from.nextFollowUpFor ?? 'Call',
      followUp: firmFollowUp(client, today),
      gaps: firmDetailGaps(client),
      tickets: ticketsFor(client),
      lastInteraction: last,
      daysSinceContact: last?.date ? Math.abs(daysUntil(last.date, today) ?? 0) : undefined,
    };
  });
}

export function temperatureMismatch(
  row: AssignedClientRow,
): TemperatureMismatch | undefined {
  const t = row.temperature;
  if (typeof t !== 'number') return undefined;

  if (t >= 7 && LONG_INACTIVE.includes(row.status)) {
    return {
      kind: 'hot-but-cold',
      message: `Scored ${t}/10 but the account has not ordered in over three calendar months.`,
    };
  }
  if (t >= 7 && (row.daysSinceContact ?? 0) > TEMPERATURE_SILENCE_DAYS) {
    return {
      kind: 'hot-but-silent',
      message: `Scored ${t}/10, but the last interaction was ${row.daysSinceContact} days ago.`,
    };
  }
  if (t <= 3 && row.status === 'Active') {
    return {
      kind: 'cold-but-buying',
      message: `Scored ${t}/10 but the account is still ordering — worth a note on why.`,
    };
  }
  return undefined;
}

export function isAtRisk(row: AssignedClientRow): boolean {
  return row.status === 'Inactive 2–3 months' && (row.followUp === 'none' || row.followUp === 'overdue');
}

export function firmLensMatches(lens: KamFirmLens, r: AssignedClientRow, today: string): boolean {
  switch (lens) {
    case 'signoff':  return firmHandoverPending(r.client);
    case 'assigned': return true;
    case 'work':     return r.followUp === 'overdue' || r.followUp === 'today';
    case 'overdue':  return r.followUp === 'overdue';
    case 'due':      return r.followUp === 'today' && r.followUpFor !== 'Meeting';
    case 'meetings': return r.followUp === 'today' && r.followUpFor === 'Meeting';
    case 'details':  return r.gaps.length > 0;
    case 'upcoming': return r.followUp === 'upcoming';
    case 'nofollow': return r.followUp === 'none';
    case 'called':   return calledOn(r.client, today);
    case 'active':   return r.status === 'Active';
    case 'lapsing':  return r.status === 'Inactive 2–3 months';
    case 'inactive': return LONG_INACTIVE.includes(r.status);
    case 'never':    return r.status === 'Never ordered';
  }
}

export function sortFirmsForLens(lens: KamFirmLens, rows: AssignedClientRow[], today: string): AssignedClientRow[] {
  const byName = (a: AssignedClientRow, b: AssignedClientRow) => a.company.localeCompare(b.company);
  const out = [...rows];
  const blankLast = (a?: string, b?: string) => (a ? (b ? a.localeCompare(b) : -1) : b ? 1 : 0);
  if (lens === 'details') return out.sort((a, b) => b.gaps.length - a.gaps.length || byName(a, b));
  if (lens === 'meetings') return out.sort((a, b) => blankLast(a.nextFollowUpTime, b.nextFollowUpTime) || byName(a, b));
  if (lens === 'overdue' || lens === 'upcoming' || lens === 'work') {
    return out.sort((a, b) => (a.nextFollowUpDate || '').localeCompare(b.nextFollowUpDate || '') || byName(a, b));
  }
  if (lens === 'lapsing') {
    return out.sort((a, b) => (daysToLapse(a.metrics, today) ?? 0) - (daysToLapse(b.metrics, today) ?? 0) || byName(a, b));
  }
  if (lens === 'nofollow') {
    return out.sort((a, b) => (b.daysSinceContact ?? Infinity) - (a.daysSinceContact ?? Infinity) || byName(a, b));
  }
  if (lens === 'signoff') return out.sort((a, b) => String(firmHandover(a.client)?.at || '').localeCompare(String(firmHandover(b.client)?.at || '')) || byName(a, b));
  if (lens === 'due' || lens === 'called') return out.sort(byName);
  const rank = (x: AssignedClientRow) => (x.followUp === 'overdue' ? 0 : x.followUp === 'today' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || (b.daysSinceContact ?? -1) - (a.daysSinceContact ?? -1) || byName(a, b));
}


export function referralStage(h: ClientOrderHistory | undefined, studioOrders: number, open: OpenDeal[]): ReferralStage {
  if ((h?.orders ?? 0) > 0 || studioOrders > 0) return 'ordered';
  if (open.length || (h?.enquiries ?? 0) > 0) return 'cart';
  return h ? 'none' : 'unknown';
}

export function kamReferralRows(
  rows: AssignedClientRow[],
  crm: CrmReferral[],
  studioFor: (c: ClientEntity) => StudioReferral[],
  historyFor: (phone: string) => ClientOrderHistory | undefined,
  dealsByPhone: Map<string, OpenDeal[]> | null,
): KamReferralRow[] {
  const byFirm = new Map<string, CrmReferral[]>();
  for (const r of crm) if (r.referrerKind === 'client') byFirm.set(r.referrerId, [...(byFirm.get(r.referrerId) ?? []), r]);
  const out: KamReferralRow[] = [];
  for (const firm of rows) {
    const seen = new Set<string>();
    const add = (o: { key: string; name: string; phone: string; note?: string; referredOn?: string; via: 'crm' | 'studio'; addedBy?: string; studioOrders: number }) => {
      const phone = normalizeContactNumber(o.phone);
      if (!phone || seen.has(phone)) return;
      seen.add(phone);
      const h = historyFor(phone);
      const deals = dealsByPhone ? leadDeals([phone], dealsByPhone) : NO_DEALS;
      const open = [...deals.pis, ...deals.carts];
      out.push({
        key: o.key, name: o.name, phone, note: o.note, referredOn: o.referredOn, via: o.via, addedBy: o.addedBy, firm,
        stage: referralStage(h, o.studioOrders, open),
        orders: Math.max(h?.orders ?? 0, o.studioOrders),
        enquiries: h?.enquiries ?? 0,
        lastOrder: h?.lastOrderDate || undefined,
        open,
      });
    };
    for (const r of byFirm.get(firm.client.id) ?? []) {
      add({ key: `crm:${r.id}`, name: r.clientName, phone: r.clientPhone, note: r.note, referredOn: String(r.createdAt || '').slice(0, 10), via: 'crm', addedBy: r.createdBy, studioOrders: 0 });
    }
    for (const r of studioFor(firm.client)) {
      add({ key: `studio:${firm.client.id}:${dealPhone(r.phone)}`, name: r.name, phone: r.phone, referredOn: r.referredOn?.slice(0, 10) || undefined, via: 'studio', studioOrders: r.orders || 0 });
    }
  }
  return out;
}

export function referralLensMatches(lens: KamReferralLens, r: KamReferralRow): boolean {
  if (lens === 'refNone') return r.stage === 'none';
  if (lens === 'refCart') return r.stage === 'cart';
  if (lens === 'refOrdered') return r.stage === 'ordered';
  return true;
}

export function sortReferrals(lens: KamReferralLens, rows: KamReferralRow[]): KamReferralRow[] {
  const day = (r: KamReferralRow) => r.referredOn || '';
  return [...rows].sort((a, b) => (lens === 'refNone' ? day(a).localeCompare(day(b)) : day(b).localeCompare(day(a))) || a.name.localeCompare(b.name));
}

export function kamTicketRows(rows: AssignedClientRow[], today: string): KamTicketRow[] {
  const out: KamTicketRow[] = [];
  for (const firm of rows) {
    if (!firm.tickets.length) continue;
    const logs = ticketFollowUps(firm.client.interactions);
    for (const deal of firm.tickets) {
      const f = logs.get(deal.enqId);
      const touched = !!f && f.log.some((i) => String(i.date || '').slice(0, 10) >= deal.createdOn);
      const due: FollowUpBucket = touched ? followUpBucket(f?.next?.date, today) : 'none';
      out.push({ key: `${firm.client.id}:${deal.enqId}`, firm, deal, followUp: f, touched, due });
    }
  }
  return out;
}

export function ticketLensMatches(lens: KamDealLens, t: KamTicketRow): boolean {
  const pi = t.deal.kind === 'pi';
  switch (lens) {
    case 'cartOpen':   return !pi && !t.touched;
    case 'piOpen':     return pi && !t.touched;
    case 'cartFollow': return !pi && t.touched;
    case 'piFollow':   return pi && t.touched;
    default:           return true;
  }
}

export function sortTickets(lens: KamDealLens, rows: KamTicketRow[]): KamTicketRow[] {
  const next = (t: KamTicketRow) => (t.touched ? t.followUp?.next?.date || '' : '');
  const blankLast = (a: string, b: string) => (a ? (b ? a.localeCompare(b) : -1) : b ? 1 : 0);
  const newest = (a: KamTicketRow, b: KamTicketRow) => b.deal.createdOn.localeCompare(a.deal.createdOn) || b.deal.value - a.deal.value;
  if (lens === 'cartOpen' || lens === 'piOpen') return [...rows].sort(newest);
  if (lens === 'deals') return [...rows].sort((a, b) => Number(a.touched) - Number(b.touched) || blankLast(next(a), next(b)) || newest(a, b));
  return [...rows].sort((a, b) => blankLast(next(a), next(b)) || newest(a, b));
}
