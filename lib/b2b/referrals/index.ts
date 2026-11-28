import { b2bBackendDelete, b2bBackendGet, b2bBackendPost } from '../data/backend';
import type { CrmReferral, ReferrerKind } from './types';

export type { CrmReferral, ReferrerKind } from './types';

interface ReferralRow {
  id: number;
  referrer_kind: ReferrerKind;
  referrer_id: string;
  referrer_name: string | null;
  client_name: string;
  client_phone: string;
  note: string | null;
  on_studio: boolean;
  created_by: string | null;
  created_at: string;
  studio_note?: string | null;
}

export const toReferral = (r: ReferralRow): CrmReferral => ({
  id: r.id, referrerKind: r.referrer_kind, referrerId: r.referrer_id, referrerName: r.referrer_name ?? undefined,
  clientName: r.client_name, clientPhone: r.client_phone, note: r.note ?? undefined, onStudio: r.on_studio,
  createdBy: r.created_by ?? undefined, createdAt: r.created_at,
});

const TTL_MS = 60_000;
let cached: { at: number; promise: Promise<CrmReferral[]> } | null = null;

export function fetchReferrals(): Promise<CrmReferral[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = b2bBackendGet<{ referrals: ReferralRow[] }>('/referrals').then((b) => b.referrals.map(toReferral));
  cached = { at: Date.now(), promise };
  promise.catch(() => { if (cached?.promise === promise) cached = null; });
  return promise;
}

export async function addReferral(input: {
  referrerKind: ReferrerKind; referrerId: string; referrerName?: string; clientName: string; clientPhone: string; note?: string; createdBy?: string;
  city?: string; email?: string; projectType?: string; categories?: string[];
  visit?: { ec?: string; on: string; time?: string; categories?: string[]; requirements?: string };
}): Promise<{ referral: CrmReferral; studioNote: string | null }> {
  const row = await b2bBackendPost<ReferralRow>('/referrals', {
    referrer_kind: input.referrerKind, referrer_id: input.referrerId, referrer_name: input.referrerName,
    client_name: input.clientName, client_phone: input.clientPhone, note: input.note, created_by: input.createdBy,
    city: input.city, email: input.email, project_type: input.projectType, categories: input.categories ?? [],
    visit: input.visit && { ec_name: input.visit.ec, scheduled_on: input.visit.on, scheduled_time: input.visit.time || 'any time', categories: input.visit.categories ?? [], requirements: input.visit.requirements },
  });
  cached = null;
  return { referral: toReferral(row), studioNote: row.studio_note ?? null };
}

export async function removeReferral(id: number): Promise<void> {
  await b2bBackendDelete(`/referrals/${id}`);
  cached = null;
}
