import { repNames, sameRep } from '../../../models/outreach/handover';
import { STUDIO_LENS_ORDER } from './constants';
import { KamOnboarding, StudioLens, StudioRow } from './types';

export function studioLensMatches(lens: StudioLens, r: StudioRow): boolean {
  switch (lens) {
    case 'all':          return true;
    case 'onboarded':    return r.studio.onboarded > 0;
    case 'none':         return r.studio.onboarded === 0;
    case 'nopower':      return r.studio.onboarded > 0 && r.studio.power === 0;
    case 'unclassified': return r.studio.unclassified > 0;
  }
}

export function rowsByLens(rows: StudioRow[]): Record<StudioLens, StudioRow[]> {
  const out = Object.fromEntries(STUDIO_LENS_ORDER.map((k) => [k, [] as StudioRow[]])) as Record<StudioLens, StudioRow[]>;
  for (const r of rows) for (const k of STUDIO_LENS_ORDER) if (studioLensMatches(k, r)) out[k].push(r);
  return out;
}

export function kamOnboarding(rows: StudioRow[]): KamOnboarding[] {
  const names = repNames([], rows.map((r) => r.client.kam));
  const byKam = new Map<string, StudioRow[]>();
  for (const r of rows) {
    const kam = names.find((n) => sameRep(n, r.client.kam)) ?? '';
    byKam.set(kam, [...(byKam.get(kam) || []), r]);
  }
  return [...byKam.entries()]
    .map(([kam, list]) => {
      const onboarded = list.filter((r) => studioLensMatches('onboarded', r)).length;
      return { kam, firms: list.length, onboarded, pct: list.length ? Math.round((onboarded / list.length) * 100) : null };
    })
    .sort((a, b) => (a.kam ? 0 : 1) - (b.kam ? 0 : 1) || (b.pct ?? -1) - (a.pct ?? -1) || a.kam.localeCompare(b.kam));
}
