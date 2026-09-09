export const CITIES = ['Bengaluru', 'Hyderabad'];
export type CityFilter = 'all' | string;

export function cityOf(row: { city?: string | null } | null | undefined): string {
  return (row && row.city) || 'Bengaluru';
}
export function inCity<T extends { city?: string | null }>(list: T[], city: CityFilter): T[] {
  return city === 'all' ? list : list.filter((r) => cityOf(r) === city);
}
export function loadCityFilter(): CityFilter {
  if (typeof window === 'undefined') return 'all';
  try { return localStorage.getItem('md_city') || 'all'; } catch { return 'all'; }
}
export function saveCityFilter(c: CityFilter) {
  try { localStorage.setItem('md_city', c); } catch { /* best-effort */ }
}

