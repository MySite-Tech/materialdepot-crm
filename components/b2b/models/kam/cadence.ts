import { ClientEntity, ClientOrderMetrics, clientStatus, currentTemperature, latestInteraction, nextFollowUp, primaryContact, temperatureBand } from '../client';
import { daysUntil, followUpBucket, istToday } from '../inbound';
import { AT_RISK_WINDOW_DAYS, DAILY_CALL_TARGET, TEMPERATURE_SILENCE_DAYS } from '../../constants/kam';
import { AssignedClientRow, CadenceRow, CallCompliance, TemperatureMismatch } from '../../types/kam';

export function callsLoggedOn(
  clients: ClientEntity[],
  kam: string,
  day: string,
): number {
  const seen = new Set<string>();
  for (const c of clients) {
    if (c.kam !== kam) continue;
    for (const i of c.interactions || []) {
      if (i.type !== 'Call') continue;
      if (String(i.date || '').slice(0, 10) !== day) continue;
      seen.add(`${c.id}|${day}`);
    }
  }
  return seen.size;
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
      overdueFollowUps: mine.filter((c) => followUpBucket(nextFollowUp(c.interactions)?.date, today) === 'overdue').length,
      dueToday: mine.filter((c) => followUpBucket(nextFollowUp(c.interactions)?.date, today) === 'today').length,
    };
  });
}

export function todaysCalls(clients: ClientEntity[], today: string = istToday()): CadenceRow[] {
  const out: CadenceRow[] = [];
  for (const client of clients) {
    const next = nextFollowUp(client.interactions);
    if (next && next.date === today) out.push({ client, date: next.date, agedDays: 0, from: next.from });
  }
  return out.sort((a, b) => a.client.company.localeCompare(b.client.company));
}

export function followUpQueue(clients: ClientEntity[], today: string = istToday()): CadenceRow[] {
  const out: CadenceRow[] = [];
  for (const client of clients) {
    const next = nextFollowUp(client.interactions);
    if (!next || next.date >= today) continue;
    out.push({ client, date: next.date, agedDays: Math.abs(daysUntil(next.date, today) ?? 0), from: next.from });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.client.company.localeCompare(b.client.company));
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
      followUp: followUpBucket(next?.date, today),
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
      message: `Scored ${t}/10 but the account has not ordered in over 3 months.`,
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

export function isAtRisk(row: AssignedClientRow, daysLeft: number | undefined): boolean {
  if (row.status !== 'Active') return false;
  if (daysLeft === undefined || daysLeft > AT_RISK_WINDOW_DAYS) return false;
  return row.followUp === 'none' || row.followUp === 'overdue';
}

