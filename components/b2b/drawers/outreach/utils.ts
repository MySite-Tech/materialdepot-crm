import { OutreachLead } from '../../models/mock-data';
import { meetingGaps, outreachCaptureErrors } from '../../models/outreach/reminders';
import { OutreachTab } from './types';

export const nowIso = () => new Date().toISOString();

const EN_IN = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?/i;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function noteMs(ts: string | undefined): number {
  const m = EN_IN.exec(String(ts || '').trim());
  if (!m) {
    const ms = Date.parse(ts || '');
    return Number.isNaN(ms) ? 0 : ms;
  }
  const [, d, mo, y, h, mi, s, ap] = m;
  const hour = !ap ? Number(h) : (Number(h) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s || 0)) - IST_OFFSET_MS;
}

export function gateTab(l: OutreachLead, stageErrors: string[]): OutreachTab {
  if (stageErrors.length) return 'deal';
  if ((l.meetings || []).some((m) => meetingGaps(m).length)) return 'meetings';
  if (outreachCaptureErrors({ ...l, followUpDate: l.followUpDate || 'set' }).length) return 'client';
  return 'meetings';
}
