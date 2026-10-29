import { KpiValue, OutreachKpiDef, Period, isWholeMonth } from '../../../models/outreach/kpis';

export const fmtValue = (def: OutreachKpiDef, v: number | null): string => {
  if (v === null) return def.key === 'waitlist' ? 'Unknown' : '—';
  if (def.unit === '%') return `${v}%`;
  if (def.unit === 'L') return `₹${v}L`;
  return String(v);
};

export const fmtTarget = (def: OutreachKpiDef, t: number): string =>
  def.unit === '%' ? `${t}%` : def.unit === 'L' ? `₹${t}L` : String(t);

export function paceFor(def: OutreachKpiDef, period: Period, today: string): number | null {
  if (def.unit === '%' || !isWholeMonth(period) || today < period.from || today > period.to) return null;
  return Number(today.slice(8, 10)) / Number(period.to.slice(8, 10));
}

export interface Tone { bar: string; text: string }

export function tone(v: number | null, target: number | null, pace: number | null): Tone {
  if (v === null || target === null || target <= 0) return { bar: '#9CA3AF', text: v === null ? 'text-gray-400' : 'text-gray-900' };
  const r = v / (target * (pace ?? 1));
  if (r >= 1) return { bar: '#16A34A', text: 'text-green-700' };
  if (r >= 0.6) return { bar: '#F59E0B', text: 'text-amber-700' };
  return { bar: '#EF4444', text: 'text-red-600' };
}

export function tileHint(def: OutreachKpiDef, k: KpiValue): { text: string; warn?: boolean } | undefined {
  if (k.value === null && def.key === 'waitlist') return { text: 'Not reachable', warn: true };
  const counted = k.rows.filter((r) => r.counts).length;
  if (def.unit === '%') return { text: k.rows.length ? `${counted} of ${k.rows.length}` : 'none in period' };
  const missed = k.rows.length - counted;
  if (missed) return { text: `+${missed} not counted`, warn: true };
  if (def.unit === 'L' && counted) return { text: `${counted} order${counted === 1 ? '' : 's'}` };
  return undefined;
}
