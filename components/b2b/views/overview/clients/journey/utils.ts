import type { BridgeKey, FirmRow, JourneyPath, JourneySide } from '../../../../../../lib/b2b/revenue/journey';
import { rowBridgeKey } from '../../../../../../lib/b2b/revenue/journey';
import { fmtL } from '../../../../models/mock-data';

export type FirmFocus =
  | { kind: 'bridge'; key: BridgeKey; label: string }
  | { kind: 'link'; from: JourneySide; to: JourneySide; path: JourneyPath | null; label: string }
  | { kind: 'category'; name: string; label: string }
  | { kind: 'path'; path: JourneyPath; label: string };

export function inFocus(r: FirmRow, f: FirmFocus | null): boolean {
  if (!f) return true;
  switch (f.kind) {
    case 'bridge': return rowBridgeKey(r) === f.key;
    case 'path': return r.path === f.path;
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
