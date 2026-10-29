import { getToken, refreshSession } from '@/lib/api/core/client';
import { fetchRows } from '../data/reads';
import { rowToInbound } from '../mappers/inbound';
import type { InboundLead } from '@/components/b2b/models/mock-data';
import type { WaitlistSignup } from '@/components/b2b/models/outreach';

export async function fetchStudioWaitlist(retried = false): Promise<WaitlistSignup[]> {
  const res = await fetch('/api/b2b/waitlist', { cache: 'no-store', headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401 && !retried && await refreshSession()) return fetchStudioWaitlist(true);
  const body = (await res.json().catch(() => ({}))) as { signups?: WaitlistSignup[]; error?: string };
  if (!res.ok || !Array.isArray(body.signups)) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body.signups;
}

export async function fetchInboundForOutreach(): Promise<InboundLead[]> {
  return (await fetchRows('inbound')).map(rowToInbound);
}
