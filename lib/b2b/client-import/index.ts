import { getToken, refreshSession } from '@/lib/api/core/client';
import { b2bBackendDelete, b2bBackendPost } from '../data/backend';
import type { ReviewFirm, ReviewQueue } from './types';

export { reviewToClient, reviewToInbound, reviewToOutreach } from './utils/convert';

export async function fetchReviewQueue(refresh = false, retried = false): Promise<ReviewQueue> {
  const res = await fetch(`/api/b2b/client-import${refresh ? '?refresh=1' : ''}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401 && !retried && await refreshSession()) return fetchReviewQueue(refresh, true);
  const body = (await res.json().catch(() => ({}))) as ReviewQueue & { error?: string };
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export const markNotClient = (firms: ReviewFirm[], by: string): Promise<{ saved: number }> =>
  b2bBackendPost('/client-review', {
    by,
    items: firms.map((f) => ({ key: f.key, firm: f.name, gstins: f.gstins, phones: f.contacts.map((c) => c.number) })),
  });

export const undoNotClient = (key: string): Promise<{ deleted: number }> =>
  b2bBackendDelete(`/client-review/${encodeURIComponent(key)}`);
