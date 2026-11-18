'use client';

import { InstallOrder } from '../types';
import { DraftState } from './types';

export function buildInitDraft(o: InstallOrder): DraftState {
  if (o.service) {
    return {
      flooring: (o.service.flooring || []).map((x) => ({ ...x })),
      wallpaper: (o.service.wallpaper || []).map((x) => ({ ...x })),
      wallpanel: (o.service.wallpanel || []).map((x) => ({ ...x })),
    };
  }
  const sk = o.skus || [];
  return {
    flooring: sk.filter((s) => s.type === 'flooring').map((s) => ({ sku: s.c, name: s.n && s.n !== s.c ? s.n : '', sqft: '', link: '' })),
    wallpaper: sk.filter((s) => s.type === 'wallpaper').map((s) => ({ sku: s.c, name: s.n && s.n !== s.c ? s.n : '', sqft: '' })),
    wallpanel: sk.filter((s) => s.type === 'wallpanel').map((s) => ({ sku: s.c, name: s.n && s.n !== s.c ? s.n : '', sqft: '', link: '' })),
  };
}

export function withOmsAreas(d: DraftState, areas: Map<string, number>): DraftState {
  const fill = (rows: DraftState['flooring']) => rows.map((r) => (!r.sqft && areas.has(r.sku) ? { ...r, sqft: String(areas.get(r.sku)) } : r));
  return { flooring: fill(d.flooring), wallpaper: fill(d.wallpaper), wallpanel: fill(d.wallpanel) };
}
