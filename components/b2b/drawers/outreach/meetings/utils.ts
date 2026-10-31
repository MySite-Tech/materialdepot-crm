import { OutreachMeeting } from '../../../models/mock-data';
import { meetingGaps } from '../../../models/outreach/reminders';

export function meetingsNewestFirst(meetings: OutreachMeeting[]): OutreachMeeting[] {
  return [...meetings].sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')) || b.n - a.n);
}

export function startsExpanded(m: OutreachMeeting): boolean {
  return m.status === 'Scheduled' || meetingGaps(m).length > 0;
}

export function fmtMeetingDay(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');
}

export function gapLabel(m: OutreachMeeting, prev: OutreachMeeting | undefined): string {
  if (!prev?.date || !m.date) return '';
  const days = Math.round((Date.parse(`${m.date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${prev.date.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return '';
  if (days === 0) return `same day as meeting ${prev.n}`;
  return `${days} day${days === 1 ? '' : 's'} after meeting ${prev.n}`;
}
