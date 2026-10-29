import { INBOUND_DAY_CUTOFF_HOUR, INBOUND_STATUSES, LEGACY_STAGES, NON_WORKING_WEEKDAYS } from '../constants/inbound';
import { InboundStatus, LegacyDecomposition, LegacyStage } from '../types/inbound';

export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isWorkingDay = (day: string): boolean =>
  !NON_WORKING_WEEKDAYS.includes(new Date(`${day}T00:00:00Z`).getUTCDay());

export function nextWorkingDay(day: string): string {
  let d = addDays(day, 1);
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

export function inboundWorkDay(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  const at = new Date(ms);
  const day = istToday(at);
  const hour = Number(at.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  if (hour >= INBOUND_DAY_CUTOFF_HOUR) return nextWorkingDay(day);
  return isWorkingDay(day) ? day : nextWorkingDay(day);
}

export function daysUntil(date: string | undefined, today = istToday()): number | undefined {
  const d = String(date || '').slice(0, 10);
  if (!d) return undefined;
  const a = Date.parse(`${d}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.round((a - b) / 86_400_000);
}

export function nameIsJustThePhone(
  lead: { companyName?: string; company?: string; phone?: string },
): boolean {
  if (String(lead.companyName || '').trim()) return false;
  const name = String(lead.company || '').replace(/\D/g, '');
  const phone = String(lead.phone || '').replace(/\D/g, '');
  if (!phone) return false;

  if (/^lead \d+$/i.test(String(lead.company || '').trim())) return true;
  return !!name && name.slice(-10) === phone.slice(-10);
}

export function normalizeStatus(stage: string | undefined): InboundStatus {
  if (!stage) return 'New';
  if ((INBOUND_STATUSES as string[]).includes(stage)) return stage as InboundStatus;
  return decomposeLegacyStage(stage).status;
}

export function decomposeLegacyStage(stage: string): LegacyDecomposition {
  return LEGACY_STAGES[stage as LegacyStage] ?? { status: 'New' };
}
