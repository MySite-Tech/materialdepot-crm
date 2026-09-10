import { LeadDeal } from '@/components/b2b/models/mock-data';
import { fetchLeadsByPhone } from '@/lib/api';

export interface EnqLookup {
  status: 'matched' | 'no-match' | 'unavailable';

  orderValue?: number;
  dealStatus?: string;

  bmName?: string;
  branch?: string;

  available?: string[];

  deal?: LeadDeal;
}

const normalizeEnq = (v: string | undefined): string =>
  String(v || '').trim().toUpperCase().replace(/\s+/g, '');

export async function lookupEnqId(phone: string | undefined, enqId: string | undefined): Promise<EnqLookup> {
  const want = normalizeEnq(enqId);
  const ph = String(phone || '').trim();
  if (!want || !ph) return { status: 'no-match' };

  let deals: LeadDeal[];
  try {
    const results = await fetchLeadsByPhone(ph);
    if (!Array.isArray(results)) throw new Error('deal ticket search returned a non-array');
    deals = results.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      status: r.status || '',
      cartValue: Number(r.cartValue) || 0,
      cartItems: r.cartItems || undefined,
      branch: r.branch || undefined,
      assignedTo: r.assignedTo || undefined,
      createdAt: r.createdAt || undefined,
      followUpDate: r.followUpDate || undefined,
      closureDate: r.closureDate || undefined,
      lostReason: r.lostReason || undefined,
    }));
  } catch (e) {

    console.error('[b2b] enq lookup failed', e);
    return { status: 'unavailable' };
  }
  const hit = deals.find((d) => normalizeEnq(d.id) === want);
  if (!hit) {
    return { status: 'no-match', available: deals.map((d) => d.id).filter(Boolean) };
  }
  return {
    status: 'matched',
    orderValue: Number(hit.cartValue) || 0,
    dealStatus: hit.status || undefined,
    bmName: hit.assignedTo || undefined,
    branch: hit.branch || undefined,
    deal: hit,
  };
}

