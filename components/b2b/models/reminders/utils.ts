import { REMINDER_LEAD_MINUTES } from './constants';
import type { Reminder, ReminderState } from './types';

const IST_MS = 19_800_000;
const DAY_MS = 86_400_000;

export const cleanTime = (t: string | undefined | null): string | undefined => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(t || '').trim());
  return m ? `${m[1]}:${m[2]}` : undefined;
};

export const cleanDay = (d: string | undefined | null): string => {
  const s = String(d || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

export function followUpAt(date: string, time?: string): number {
  const ms = Date.parse(`${cleanDay(date)}T00:00:00Z`);
  if (Number.isNaN(ms)) return NaN;
  const t = cleanTime(time);
  const minutes = t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : 0;
  return ms - IST_MS + minutes * 60_000;
}

export const istDayOf = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);

export function fmtTime(time: string | undefined): string {
  const t = cleanTime(time);
  if (!t) return '';
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? 'am' : 'pm'}`;
}

export function fmtFollowUp(date: string | undefined, time?: string): string {
  const d = cleanDay(date);
  if (!d) return '';
  const day = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const t = fmtTime(time);
  return t ? `${day} · ${t}` : day;
}

export function reminderState(r: Pick<Reminder, 'date' | 'time' | 'dueAt'>, nowMs: number): ReminderState {
  const today = istDayOf(nowMs);
  if (r.date < today) return 'overdue';
  if (r.date > today) return 'later';
  if (!r.time) return 'today';
  if (nowMs >= r.dueAt) return 'due';
  return nowMs >= r.dueAt - REMINDER_LEAD_MINUTES * 60_000 ? 'soon' : 'later';
}

export const daysLate = (date: string, nowMs: number): number =>
  Math.round((Date.parse(`${istDayOf(nowMs)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);

export const minutesUntil = (dueAt: number, nowMs: number): number => Math.ceil((dueAt - nowMs) / 60_000);
