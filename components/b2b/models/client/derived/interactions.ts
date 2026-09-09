import { TEMPERATURE_BANDS } from '../../../constants/client';
import { ClientInteraction, TemperatureBand } from '../../../types/client';

export function sortedInteractions(list: ClientInteraction[] | undefined): ClientInteraction[] {
  return [...(list || [])].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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

export function nextFollowUp(list: ClientInteraction[] | undefined): { date: string; from: ClientInteraction } | undefined {
  const latest = latestInteraction(list);
  const date = String(latest?.nextFollowUpDate || '').slice(0, 10);
  return latest && date ? { date, from: latest } : undefined;
}

