'use client';

import { bmPhoneOfOrder, phoneKey } from '../../shared';
import { BmProfile, Order } from './types';

function norm(s?: string | null) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function orderBelongsToBm(row: { bm?: string | null; bm_email?: string | null }, bm: BmProfile): boolean {
  const mine = phoneKey(bm.contact);
  const theirs = bmPhoneOfOrder(row);
  if (mine && theirs) return mine === theirs;
  if (row.bm_email) return !!bm.email && norm(row.bm_email) === norm(bm.email);
  const bmText = norm(row.bm);
  if (!bmText) return false;
  return bmNames(bm).has(bmText);
}

export function isPreBooking(row: { status?: string | null }): boolean {
  return row.status === 'slot_reserved' || row.status === 'slot_converted';
}

export function dropSupersededPreBookings<T extends { pi?: string | null; po?: string | null; status?: string | null }>(rows: T[]): T[] {
  const realPis = new Set<string>();
  for (const r of rows) {
    if (isPreBooking(r) || r.status === 'deleted') continue;
    const pi = norm(r.pi);
    if (pi) realPis.add(pi);
  }
  return rows.filter((r) => {
    if (!isPreBooking(r)) return true;
    if (r.status === 'slot_converted') return false;
    return !String(r.po || '').split(',').map(norm).some((enq) => enq && realPis.has(enq));
  });
}

function bmNames(bm: BmProfile): Set<string> {
  const out = new Set<string>();
  for (const n of [bm.name, ...(bm.aliases || [])]) {
    const v = norm(n);
    if (v) out.add(v);
  }
  return out;
}

export function auditAnchor(o: Order): string | null {
  return o.date || (o.createdAt ? String(o.createdAt).slice(0, 10) : null);
}
