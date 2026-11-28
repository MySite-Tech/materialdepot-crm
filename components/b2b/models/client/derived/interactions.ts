import { TEMPERATURE_BANDS } from '../../../constants/client';
import { ClientInteraction, TemperatureBand } from '../../../types/client';

export function sortedInteractions(list: ClientInteraction[] | undefined): ClientInteraction[] {
  return [...(list || [])].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function withInteraction(list: ClientInteraction[] | undefined, i: ClientInteraction): ClientInteraction[] {
  const all = list || [];
  return all.some((x) => x.id === i.id) ? all.map((x) => (x.id === i.id ? i : x)) : [...all, i];
}

export function openCheckIn(list: ClientInteraction[] | undefined): ClientInteraction | undefined {
  return sortedInteractions(list).find((i) => i.type === 'Meeting' && i.checkIn && !String(i.summary || '').trim());
}

export function latestInteraction(list: ClientInteraction[] | undefined): ClientInteraction | undefined {
  return sortedInteractions(list)[0];
}

export function currentTemperature(list: ClientInteraction[] | undefined): { value: number; at: string } | undefined {
  for (const i of sortedInteractions(list)) {
    if (typeof i.temperature === 'number') return { value: i.temperature, at: i.date };
  }
  return undefined;
}

export function temperatureBand(v: number | undefined): TemperatureBand | undefined {
  if (typeof v !== 'number') return undefined;
  return TEMPERATURE_BANDS.find((b) => v >= b.min && v <= b.max)?.key;
}

export function temperatureColor(v: number | undefined): string {
  const band = temperatureBand(v);
  return TEMPERATURE_BANDS.find((b) => b.key === band)?.color || '#9CA3AF';
}

export function currentUpcomingProject(list: ClientInteraction[] | undefined): { text: string; at: string } | undefined {
  for (const i of sortedInteractions(list)) {
    const text = String(i.upcomingProject || '').trim();
    if (text) return { text, at: i.date };
  }
  return undefined;
}

export function nextFollowUp(list: ClientInteraction[] | undefined): { date: string; time?: string; from: ClientInteraction } | undefined {
  const open = openCheckIn(list);
  const latest = latestInteraction((list || []).filter((i) => i !== open && !i.enqId));
  const date = String(latest?.nextFollowUpDate || '').slice(0, 10);
  return latest && date ? { date, time: latest.nextFollowUpTime || undefined, from: latest } : undefined;
}


export interface TicketFollowUp {
  enqId: string;
  kind?: 'cart' | 'pi';
  log: ClientInteraction[];
  last: ClientInteraction;
  next?: { date: string; time?: string };
}

export function ticketFollowUps(list: ClientInteraction[] | undefined): Map<string, TicketFollowUp> {
  const out = new Map<string, TicketFollowUp>();
  for (const i of sortedInteractions((list || []).filter((x) => x.enqId))) {
    const prev = out.get(i.enqId!);
    if (prev) { prev.log.push(i); continue; }
    const date = String(i.nextFollowUpDate || '').slice(0, 10);
    out.set(i.enqId!, { enqId: i.enqId!, kind: i.ticketKind, log: [i], last: i, next: date ? { date, time: i.nextFollowUpTime || undefined } : undefined });
  }
  return out;
}
