'use client';

import { sbGet } from '../../siteAuditShared';

import { mapOwnedInstall } from '../../utils/owned-orders';

import { WpRow } from '../../coe-ops/wpTrack';
import { BmProfile, orderBelongsToBm } from '../SiteAuditBmView';
import { OWNED_INSTALL_COLS, OWNED_WP_COLS } from '../../constants/owned-orders';
import { OwnedInstall } from '../../types/owned-orders';

export async function loadOwnedInstalls(people: BmProfile[]): Promise<OwnedInstall[]> {
  if (!people.length) return [];
  const rows = await sbGet('install_orders_slim?select=' + OWNED_INSTALL_COLS + '&status=neq.deleted&order=created_at.desc');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) => people.some((p) => orderBelongsToBm(r, p))).map(mapOwnedInstall);
}

export async function loadOwnedWallpapers(people: BmProfile[]): Promise<WpRow[]> {
  if (!people.length) return [];
  const rows = await sbGet('wp_production?select=' + OWNED_WP_COLS + '&order=created_at.desc');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r: any) => people.some((p) => orderBelongsToBm(r, p))) as WpRow[];
}
