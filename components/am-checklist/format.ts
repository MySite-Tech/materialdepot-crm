/** ₹ in the floor's short style: ₹850, ₹7K, ₹1.0L, ₹2.3Cr. */
export function rupeesShort(value: number | null | undefined): string {
  const n = Number(value) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}K`;
  return `₹${Math.round(n)}`;
}

/** "2026-11-02" -> "2 Nov" */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "2026-11-02" -> "Mon, 2 Nov" */
export function weekdayDayMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
