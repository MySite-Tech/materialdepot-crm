'use client';

import { CRMLeadsStats, FootfallBMRow } from '@/lib/api';
import { OrgPerson, normaliseName } from '@/lib/org';
import { TeamMetrics } from './types';

export interface FootfallIndex {
  byName: Map<string, FootfallBMRow>;
  ambiguous: Set<string>;
}

export const indexFootfallByName = (rows: FootfallBMRow[], people: OrgPerson[]): FootfallIndex => {
  const rowCounts = new Map<string, number>();
  for (const row of rows) {
    const key = normaliseName(row.bm_name);
    if (key) rowCounts.set(key, (rowCounts.get(key) ?? 0) + 1);
  }
  const peopleCounts = new Map<string, number>();
  for (const person of people) {
    const key = normaliseName(person.name);
    if (key) peopleCounts.set(key, (peopleCounts.get(key) ?? 0) + 1);
  }

  const byName = new Map<string, FootfallBMRow>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const key = normaliseName(row.bm_name);
    if (!key) continue;
    if ((rowCounts.get(key) ?? 0) > 1 || (peopleCounts.get(key) ?? 0) > 1) ambiguous.add(key);
    else byName.set(key, row);
  }
  return { byName, ambiguous };
};

export const metricsFor = (leads: CRMLeadsStats | undefined, footfall: FootfallBMRow | undefined): TeamMetrics | null => {
  if (!leads) return null;
  const orders = leads.won.count;
  const salesValue = leads.won.value;
  const walkins = footfall ? footfall.footfall_users : null;
  return {
    footfall: walkins,
    carts: footfall ? footfall.cart_users : null,
    cartPct: footfall ? footfall.cart_pct : null,
    orders,
    salesValue,
    aov: orders > 0 ? salesValue / orders : null,
    convPct: footfall && footfall.footfall_users > 0 ? footfall.order_pct : null,
    pipelineCount: leads.active.count,
    pipelineValue: leads.active.value,
    lostCount: leads.lost.count,
  };
};
