import { INBOUND_STATUSES, LEGACY_STAGES } from '../constants/inbound';
import { InboundStatus, LegacyDecomposition, LegacyStage } from '../types/inbound';

export function istToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
