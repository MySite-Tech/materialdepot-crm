import { b2bBackendGet } from '../data/backend';
import type { StudioReferralDetail } from './types';

export type { StudioOrder, StudioReferralDetail, StudioVisit } from './types';

type Raw = Record<string, unknown>;

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);

function toDetail(r: Raw): StudioReferralDetail {
  const visits = Array.isArray(r.visits) ? (r.visits as Raw[]) : [];
  const orders = Array.isArray(r.orders) ? (r.orders as Raw[]) : [];
  return {
    phone: String(r.phone ?? ''), firmName: s(r.firm_name) ?? '', clientName: s(r.client_name) ?? '', status: s(r.status) ?? '', source: s(r.source) ?? '',
    referredOn: s(r.referred_on), notes: s(r.notes), email: s(r.email), city: s(r.city), locality: s(r.locality),
    projectType: s(r.project_type), budget: s(r.budget), timeline: s(r.timeline), categories: list(r.categories), rejectionReason: s(r.rejection_reason),
    visits: visits.map((v) => ({
      ec: s(v.ec), on: String(v.on ?? ''), time: s(v.time) ?? '', categories: list(v.categories), requirements: s(v.requirements), notes: s(v.notes),
      status: s(v.status) ?? '', visitedVia: s(v.visited_via), cancelReason: s(v.cancel_reason), bm: s(v.bm), bmPhone: s(v.bm_phone),
      storeStatus: s(v.store_status), storeNote: s(v.store_note), bookedOn: s(v.booked_on),
    })),
    orders: orders.map((o) => ({ enqId: String(o.enq_id ?? ''), value: Number(o.value) || 0, on: s(o.on), status: s(o.status), approval: s(o.approval) })),
  };
}

const cache = new Map<string, Promise<StudioReferralDetail[]>>();

export function fetchStudioReferrals(phones: string[]): Promise<StudioReferralDetail[]> {
  const key = [...new Set(phones.map((p) => p.replace(/\D/g, '').slice(-10)).filter((p) => p.length === 10))].sort().join(',');
  if (!key) return Promise.resolve([]);
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = b2bBackendGet<{ referrals: Raw[] }>(`/studio-referrals?phones=${key}`).then((b) => b.referrals.map(toDetail));
  cache.set(key, promise);
  setTimeout(() => cache.delete(key), 60_000);
  promise.catch(() => cache.delete(key));
  return promise;
}
