import { ClientEntity } from '../../../types/client';
import { contactNumbers } from '../../utils/client';
import { gstNumbers } from '../rules/gst';

export function clientMatchesSearch(c: ClientEntity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return c.company.toLowerCase().includes(q)
    || (c.contacts || []).some((x) => (x.name || '').toLowerCase().includes(q))
    || (digits.length >= 4 && contactNumbers(c.contacts).some((p) => p.includes(digits)))
    || gstNumbers(c.gsts).some((g) => g.toLowerCase().includes(q));
}
