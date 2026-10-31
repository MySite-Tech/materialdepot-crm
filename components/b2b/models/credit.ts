import { sameRep } from './outreach/handover';
import { normalisePhone } from '@/lib/org/utils';

export interface RevenueCredit {
  name: string;
  phone?: string;
  kylasUserId?: number | null;
  reason: string;
  by: string;
  at: string;
}

export interface Creditable {
  name: string;
  phone?: string;
  kylasUserId?: number | null;
}

export function creditMatches(c: RevenueCredit, p: Creditable): boolean {
  const a = normalisePhone(c.phone);
  const b = normalisePhone(p.phone);
  if (a.length === 10 && b.length === 10) return a === b;
  if (c.kylasUserId != null && p.kylasUserId != null) return c.kylasUserId === p.kylasUserId;
  return sameRep(c.name, p.name);
}

export const creditOf = (c: RevenueCredit | undefined): RevenueCredit | undefined => (c?.name ? c : undefined);

export const creditNote = (c: RevenueCredit | undefined): string =>
  creditOf(c) && c ? ` · credited to ${c.name} by ${c.by}${c.reason ? `: ${c.reason}` : ''}` : '';
