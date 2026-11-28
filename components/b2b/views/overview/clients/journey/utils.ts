import type { BridgeKey, FirmRow, JourneyPath, JourneySide } from '../../../../../../lib/b2b/revenue/journey';
import { ENTRY_PATHS, rowBridgeKey } from '../../../../../../lib/b2b/revenue/journey';
import { fmtL } from '../../../../models/mock-data';

export type FirmSet = 'ordering' | 'kept' | 'lost' | 'joined';

export const FIRM_SETS: Record<FirmSet, (r: FirmRow) => boolean> = {
  ordering: (r) => r.b.orders > 0,
  kept: (r) => r.a.orders > 0 && r.b.orders > 0,
  lost: (r) => r.a.orders > 0 && !r.b.orders,
  joined: (r) => (ENTRY_PATHS.has(r.path) || r.path === 'ecToStudio') && r.b.value > 0 && !r.a.value,
};

export type FirmFocus =
  | { kind: 'bridge'; key: BridgeKey; label: string }
  | { kind: 'link'; from: JourneySide; to: JourneySide; path: JourneyPath | null; label: string }
  | { kind: 'category'; name: string; label: string }
  | { kind: 'path'; path: JourneyPath; label: string }
  | { kind: 'set'; set: FirmSet; label: string };

export function inFocus(r: FirmRow, f: FirmFocus | null): boolean {
  if (!f) return true;
  switch (f.kind) {
    case 'bridge': return rowBridgeKey(r) === f.key;
    case 'path': return r.path === f.path;
    case 'set': return FIRM_SETS[f.set](r);
    case 'category': return r.a.categories.includes(f.name) || r.b.categories.includes(f.name);
    case 'link': return r.sideA === f.from && r.sideB === f.to && (!f.path || r.path === f.path);
  }
}

export const pct = (part: number, whole: number): number | null => (whole ? (100 * part) / whole : null);

export const fmtPct = (v: number | null, digits = 0): string => (v === null ? '—' : `${v.toFixed(digits)}%`);

export function change(now: number, before: number): { text: string; up: boolean } | null {
  if (!before) return null;
  const v = (100 * (now - before)) / before;
  return { text: `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`, up: v >= 0 };
}

export const monthName = (key: string, long = false): string =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: long ? 'long' : 'short', timeZone: 'UTC' });

export const fmtK = (v: number): string => (v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${(v / 1e3).toFixed(1)}K`);

export const signedL = (v: number): string => `${v < 0 ? '−' : '+'}${fmtL(Math.abs(v))}`;
