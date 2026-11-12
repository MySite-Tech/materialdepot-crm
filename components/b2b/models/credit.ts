import { sameRep } from './outreach/handover';
import { normalisePhone } from '@/lib/org/utils';

export interface Creditable {
  name: string;
  phone?: string;
  kylasUserId?: number | null;
}

export function creditMatches(c: Creditable, p: Creditable): boolean {
  const a = normalisePhone(c.phone);
  const b = normalisePhone(p.phone);
  if (a.length === 10 && b.length === 10) return a === b;
  if (c.kylasUserId != null && p.kylasUserId != null) return c.kylasUserId === p.kylasUserId;
  return sameRep(c.name, p.name);
}
