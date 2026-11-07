import type { FirmKind, ReviewFirm } from '@/lib/b2b/client-import/types';

export type ReviewSort = 'value' | 'orders' | 'last';

export function matchesReview(f: ReviewFirm, kind: FirmKind | 'all', search: string): boolean {
  if (kind !== 'all' && f.kind !== kind) return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return f.name.toLowerCase().includes(q)
    || f.gstins.some((g) => g.toLowerCase().includes(q))
    || f.contacts.some((c) => (c.name || '').toLowerCase().includes(q) || (digits.length >= 4 && c.number.includes(digits)));
}

export function sortReview<T extends ReviewFirm>(list: T[], sort: ReviewSort): T[] {
  const by: Record<ReviewSort, (a: T, b: T) => number> = {
    value: (a, b) => b.value - a.value,
    orders: (a, b) => b.orders - a.orders || b.value - a.value,
    last: (a, b) => b.lastOrder.localeCompare(a.lastOrder),
  };
  return [...list].sort((a, b) => by[sort](a, b) || a.key.localeCompare(b.key));
}
