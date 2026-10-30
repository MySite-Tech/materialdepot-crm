import { ClientEntity, ClientOrderMetrics, INACTIVE_DAYS, clientStatus, currentTemperature, daysToLapse, latestInteraction, nextFollowUp, primaryContact, temperatureBand } from '../client';
import { daysUntil, followUpBucket, istToday } from '../inbound';
import { DAILY_CALL_TARGET, KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES, TEMPERATURE_SILENCE_DAYS } from '../../constants/kam';
import { AssignedClientRow, CallCompliance, KamFirmLens, KamOrder, KamOrderLens, TemperatureMismatch } from '../../types/kam';
import { firmHandover, firmHandoverPending } from './handover';

export const calledOn = (c: ClientEntity, day: string): boolean =>
  (c.interactions || []).some((i) => i.type === 'Call' && String(i.date || '').slice(0, 10) === day);

export const firmFollowUp = (c: ClientEntity, today: string) => followUpBucket(nextFollowUp(c.interactions)?.date, today);

export function callsLoggedOn(
  clients: ClientEntity[],
  kam: string,
  day: string,
): number {
  return clients.filter((c) => c.kam === kam && calledOn(c, day)).length;
}

export function callCompliance(
  clients: ClientEntity[],
  kams: string[],
  today: string = istToday(),
): CallCompliance[] {
  return kams.map((kam) => {
    const mine = clients.filter((c) => c.kam === kam);
    return {
      kam,
      logged: callsLoggedOn(clients, kam, today),
      target: DAILY_CALL_TARGET,
      overdueFollowUps: mine.filter((c) => firmFollowUp(c, today) === 'overdue').length,
      dueToday: mine.filter((c) => firmFollowUp(c, today) === 'today').length,
    };
  });
}

export function assignedClientRows(
  clients: ClientEntity[],
  metricsFor: (c: ClientEntity) => ClientOrderMetrics,
  today: string = istToday(),
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
      followUp: firmFollowUp(client, today),
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

  if (t >= 7 && row.status === 'Inactive') {
    return {
      kind: 'hot-but-cold',
      message: `Scored ${t}/10 but the account has not ordered in over ${INACTIVE_DAYS} days.`,
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
  return row.status === 'Inactive 1 month' && (row.followUp === 'none' || row.followUp === 'overdue');
}

export function firmLensMatches(lens: KamFirmLens, r: AssignedClientRow, today: string): boolean {
  switch (lens) {
    case 'signoff':  return firmHandoverPending(r.client);
    case 'assigned': return true;
    case 'overdue':  return r.followUp === 'overdue';
    case 'due':      return r.followUp === 'today';
    case 'upcoming': return r.followUp === 'upcoming';
    case 'nofollow': return r.followUp === 'none';
    case 'called':   return calledOn(r.client, today);
    case 'active':   return r.status === 'Active';
    case 'lapsing':  return r.status === 'Inactive 1 month';
    case 'inactive': return r.status === 'Inactive';
    case 'never':    return r.status === 'Never ordered';
  }
}

export function orderLensMatches(lens: KamOrderLens, o: KamOrder): boolean {
  if (lens === 'open') return KAM_OPEN_STATUSES.includes(o.status);
  if (lens === 'pipeline') return KAM_PIPELINE_STATUSES.includes(o.status);
  return true;
}

export function sortFirmsForLens(lens: KamFirmLens, rows: AssignedClientRow[], today: string): AssignedClientRow[] {
  const byName = (a: AssignedClientRow, b: AssignedClientRow) => a.company.localeCompare(b.company);
  const out = [...rows];
  if (lens === 'overdue' || lens === 'upcoming') {
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

