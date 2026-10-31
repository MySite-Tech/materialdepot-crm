import type { EcVisit } from '@/lib/b2b/ec-visits';

export type EcLens = 'all' | 'unchecked' | 'ordered' | 'visited';

export const EC_LENSES: { key: EcLens; label: string }[] = [
  { key: 'all', label: 'All redirects' },
  { key: 'unchecked', label: 'Orders not checked' },
  { key: 'ordered', label: 'Ordered at the EC' },
  { key: 'visited', label: 'Visited' },
];

export function lensMatches(v: EcVisit, lens: EcLens): boolean {
  if (lens === 'unchecked') return !v.assisted;
  if (lens === 'ordered') return (v.assisted?.orders || 0) > 0;
  if (lens === 'visited') return v.status === 'Visited';
  return true;
}

export function assistedTotal(list: EcVisit[]): { value: number; checked: number } {
  return list.reduce((a, v) => (v.assisted ? { value: a.value + v.assisted.value, checked: a.checked + 1 } : a), { value: 0, checked: 0 });
}
