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
