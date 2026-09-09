import { CRMLeadRow, fetchCRMLeads } from '../../crm/leads';
import { kylasFetch } from '../../core/kylas-client';
import { B2B_INBOUND_OWNER_IDS, B2B_INBOUND_PAGE_SIZE } from './constants';
import { b2bInboundRule, kylasLeadIdentity, mapInboundLead } from './mappers';
import { B2BInboundPage, ClientTicketResult, InboundLeadDetail, InboundLeadEdit, KylasWriteResult } from './types';
import { categoryIdsFromLabels, categoryLabelsFromIds, cf, cfCount, cfString, normalizeTicketPhone } from './utils';
import { selectionsFromKylasLabels, selectionsToKylasLabels } from '@/components/b2b/models/inbound';
export async function fetchB2BInboundLeads(
  page = 0,
  ownerIds: number[] = B2B_INBOUND_OWNER_IDS,
  search = '',
  createdAfter = '',
  createdBefore = '',
  kylasStage?: number,
  size = B2B_INBOUND_PAGE_SIZE,
): Promise<B2BInboundPage> {
  let res;
  try {
    res = await kylasFetch(`/search/lead?sort=createdAt,desc&page=${page}&size=${size}`, {
      method: 'POST',
      body: JSON.stringify(b2bInboundRule(ownerIds, search, createdAfter, createdBefore, kylasStage)),
    });
  } catch {
    return { leads: [], page, hasMore: false, total: 0 };
  }
  const content: Record<string, any>[] = res?.content || [];
  const total = typeof res?.totalElements === 'number' ? res.totalElements : content.length;
  const totalPages = typeof res?.totalPages === 'number'
    ? res.totalPages
    : Math.ceil(total / size);
  return {
    leads: content.map(mapInboundLead),
    page,
    hasMore: page + 1 < totalPages,
    total,
  };
}

export async function fetchInboundLeadDetail(leadId: string | number): Promise<InboundLeadDetail> {
  try {
    const d = await kylasFetch(`/leads/${leadId}`);
    const pn = Array.isArray(d.phoneNumbers) && d.phoneNumbers.length ? d.phoneNumbers[0] : null;
    const { phone, contactName, displayName } = kylasLeadIdentity(d);
    return {
      loaded: true,
      kylasName: displayName,
      contactName,
      requirement: cfString(d, 'requirementName') ?? '',
      selections: selectionsFromKylasLabels(
        categoryLabelsFromIds(cf(d, 'cfCategoriesOfInterest')),
      ),
      leadSummary: cfString(d, 'cfSpaceRequirement'),
      urgency: cfString(d, 'city'),
      pincode: cfString(d, 'zipcode'),
      presalesOwner: cfString(d, 'cfPsOwner'),
      presalesClientType: cfString(d, 'cfClientType'),
      presalesMissedCalls: cfCount(d, 'cfMissedCallCount'),
      qualificationTag: cfString(d, 'companyZipcode'),
      leadCreatedAt: d.createdAt ? String(d.createdAt) : undefined,
      phoneId: pn && typeof pn.id === 'number' ? pn.id : undefined,
      phone: phone || undefined,
    };
  } catch {
    return { loaded: false };
  }
}

export async function updateInboundLeadKylas(
  leadId: string | number,
  edit: InboundLeadEdit,
): Promise<KylasWriteResult> {
  const kylasLabels = selectionsToKylasLabels(edit.selections);
  const dropped = (edit.selections || []).filter(
    (s) => !selectionsToKylasLabels([s]).length,
  );
  const body: Record<string, unknown> = {
    requirementName: edit.requirement || '',
    cfCategoriesOfInterest: categoryIdsFromLabels(kylasLabels),
  };
  try {
    await kylasFetch(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(body) });
    return { ok: true, dropped: dropped.length ? dropped : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchLeadDeals(phone: string | number): Promise<import('../../../../components/b2b/models/mock-data').LeadDeal[]> {
  const q = String(phone || '').trim();
  if (!q) return [];
  try {
    const results = await fetchLeadsByPhone(q);
    return results.map((r) => ({
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
  } catch {
    return [];
  }
}

// One `/crm/leads/?q=<phone>` per phone per session, shared by every consumer:
// KAM enquiry resolution, client order rows and the drawer lookups all want the
// same page of deal tickets for a phone. Callers filter the rows themselves, so
// this caches the raw response and leaves interpretation to them.
const phoneLeadCache = new Map<string, Promise<CRMLeadRow[]>>();

export function fetchLeadsByPhone(phone: string): Promise<CRMLeadRow[]> {
  const want = normalizeTicketPhone(phone);
  const hit = phoneLeadCache.get(want);
  if (hit) return hit;

  const promise = fetchCRMLeads({ q: want, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' })
    .then(({ results }) => (Array.isArray(results) ? results : []));
  phoneLeadCache.set(want, promise);
  promise.catch(() => phoneLeadCache.delete(want));
  return promise;
}

export function invalidateLeadsByPhone(phones: string[]): void {
  for (const p of phones) phoneLeadCache.delete(normalizeTicketPhone(p));
}

export async function fetchClientTickets(phone: string): Promise<ClientTicketResult> {
  const want = normalizeTicketPhone(phone);
  if (want.length !== 10) return { phone: want, state: 'ok', rows: [], rejected: 0 };
  try {
    const rows = await fetchLeadsByPhone(want);
    const kept = rows.filter((r) => normalizeTicketPhone(r.clientPhone) === want);
    return { phone: want, state: 'ok', rows: kept, rejected: rows.length - kept.length };
  } catch (e) {
    return {
      phone: want,
      state: 'failed',
      rows: [],
      rejected: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
