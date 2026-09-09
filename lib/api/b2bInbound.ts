import type { CRMLeadRow } from './crmLeads';
import { selectionsFromKylasLabels, selectionsToKylasLabels, type Selection } from '@/components/b2b/models/inboundModel';
import { mdFetch } from './client';
import { KYLAS_API_KEY, KYLAS_API_URL, kylasFetch } from './kylasClient';
import { fetchCRMLeads } from './crmLeads';

// ---------------------------------------------------------------------------
// B2B Inbound Leads — Kylas pipeline 31627, stages 220515 & 220290 (Hardi & Mandeep)
// ---------------------------------------------------------------------------

const B2B_INBOUND_PIPELINE = 31627;
const B2B_INBOUND_STAGES = [220515, 220290];
const B2B_INBOUND_OWNERS: Record<number, string> = {
  81181: 'Hardi',
  73321: 'Mandeep',
};

export const B2B_INBOUND_OWNER_LIST: { id: number; name: string }[] =
  Object.entries(B2B_INBOUND_OWNERS).map(([id, name]) => ({ id: Number(id), name }));

// Field names in this Kylas instance do not mean what they say — verified
// against live leads on 2026-09-08 and relied on by `mapInboundLead`:
//
//   city           → urgency ("Immediate" / "Not sure"), NOT a city
//   companyZipcode → the qualification tag ("B2B Qualified"), NOT a zipcode
//   zipcode        → the real pincode (this is the one that decides Bangalore
//                    vs Hyderabad: 50xxxx Telangana, 56xxxx Karnataka)
//   department     → a formatted mirror of the creation time; redundant with
//                    `createdAt`, so deliberately not requested
//
// `expectedClosureOn` is also requested but NOT mapped: it is auto-stamped a
// few minutes after lead creation, so it is not an expected closure date. See
// the note on `InboundLead.expectedClosure`.
const B2B_INBOUND_FIELDS = [
  'firstName', 'lastName', 'ownerId', 'pipelineStage', 'phoneNumbers', 'zipcode',
  'actualClosureDate', 'source', 'createdAt', 'updatedAt', 'cfBranch',
  'cfSpaceRequirement', 'requirementName', 'city', 'expectedClosureOn',
  'cfCategoriesOfInterest', 'id', 'recordActions', 'customFieldValues',
  'companyZipcode', 'cfClientType', 'cfPsOwner', 'cfMissedCallCount', 'metaData',
];

const KYLAS_CATEGORIES: { id: number; label: string }[] = [
  { id: 2689623, label: 'Tiles' },
  { id: 2689624, label: 'Panels' },
  { id: 2689625, label: 'Laminates' },
  { id: 2689626, label: 'Wallpapers' },
  { id: 2689627, label: 'Wooden Flooring' },
  { id: 2689628, label: 'Others' },
];

function categoryLabelsFromIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x && typeof x === 'object' ? (x as { id?: number }).id : x))
    .map((id) => KYLAS_CATEGORIES.find((c) => c.id === Number(id))?.label)
    .filter((l): l is string => !!l);
}

function categoryIdsFromLabels(labels: string[] | undefined): number[] {
  return (labels || [])
    .map((l) => KYLAS_CATEGORIES.find((c) => c.label === l)?.id)
    .filter((id): id is number => typeof id === 'number');
}

function b2bInboundRule(
  ownerIds: number[],
  search?: string,
  createdAfter?: string,
  createdBefore?: string,
  kylasStage?: number,
) {
  const ownerRule = ownerIds.length === 1
    ? { operator: 'equal', id: 'ownerId', field: 'ownerId', type: 'long', value: ownerIds[0], relatedFieldIds: null }
    : { operator: 'in', id: 'ownerId', field: 'ownerId', type: 'long', value: ownerIds, relatedFieldIds: null };
  // Narrow to one stage when the New Type filter is set, so paging/counts stay
  // correct instead of being thinned out client-side.
  const stageRule = kylasStage
    ? { operator: 'equal', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: kylasStage, relatedFieldIds: ['pipeline'] }
    : { operator: 'in', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: B2B_INBOUND_STAGES, relatedFieldIds: ['pipeline'] };
  const rules: Record<string, any>[] = [
    ownerRule,
    { operator: 'equal', id: 'pipeline', field: 'pipeline', type: 'long', value: B2B_INBOUND_PIPELINE, dependentFieldIds: ['pipelineStage', 'pipelineStageReason'] },
    stageRule,
  ];
  const q = (search || '').trim();
  if (q) {
    rules.push({ id: 'multi_field', field: 'multi_field', type: 'multi_field', input: 'multi_field', operator: 'multi_field', value: q });
  }
  if (createdAfter && createdBefore) {
    rules.push({
      operator: 'between', id: 'createdAt', field: 'createdAt', type: 'date',
      value: [createdAfter, createdBefore], relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  } else if (createdAfter) {
    rules.push({
      operator: 'greater', id: 'createdAt', field: 'createdAt', type: 'date',
      value: createdAfter, relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  } else if (createdBefore) {
    rules.push({
      operator: 'less', id: 'createdAt', field: 'createdAt', type: 'date',
      value: createdBefore, relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  }
  return {
    fields: B2B_INBOUND_FIELDS,
    jsonRule: { rules, condition: 'AND', valid: true },
  };
}

function mapInboundSource(raw: unknown): import('../../components/b2b/models/mockData').InboundLead['source'] {
  const name = (typeof raw === 'object' && raw ? (raw as { name?: string }).name || '' : String(raw || '')).toLowerCase();
  if (name.includes('whatsapp')) return 'WhatsApp';
  if (name.includes('referral')) return 'Referral';
  if (name.includes('walk')) return 'Walk-in';
  if (name.includes('google')) return 'Google';
  if (name.includes('web') || name.includes('form')) return 'Website form';
  return 'Other';
}

// A custom field can arrive either flattened onto the record or nested under
// `customFieldValues`, depending on which Kylas endpoint answered.
function cf(raw: Record<string, any>, key: string): unknown {
  const nested = raw.customFieldValues?.[key];
  return nested !== undefined && nested !== null ? nested : raw[key];
}

function cfString(raw: Record<string, any>, key: string): string | undefined {
  const v = cf(raw, key);
  if (v === undefined || v === null || v === '') return undefined;
  return String(typeof v === 'object' ? (v as { name?: string }).name ?? '' : v).trim() || undefined;
}

// `cfMissedCallCount` comes back as 1, "2.0" or 2 depending on the endpoint.
function cfCount(raw: Record<string, any>, key: string): number | undefined {
  const n = Number(cfString(raw, key));
  return Number.isFinite(n) ? n : undefined;
}

// Kylas resolves ids to display names in `metaData.idNameStore`, which is how
// `source: 2645445` becomes "Inbound Call".
function kylasIdName(raw: Record<string, any>, bucket: string, id: unknown): string | undefined {
  const store = raw?.metaData?.idNameStore?.[bucket];
  if (!store || id === undefined || id === null) return undefined;
  const name = store[String(id)];
  return typeof name === 'string' && name ? name : undefined;
}

// ── Kylas lead identity ──────────────────────────────────────────────────────
//
// This instance is inconsistent about where a lead's name and number live:
//
//   lead 53329327: firstName "9182249232", lastName null   → name IS the phone
//   lead 53197556: firstName null,         lastName "Ashu" → name is in lastName
//
// So neither field can be trusted by position. Both are read, the phone number
// comes from `phoneNumbers` (the only reliable source), and a "name" that is
// just that number again is reported as no name at all — which is precisely the
// gap PRD §3.2's Client Company Name exists to close.
//
// The previous mapper read `firstName` only and used `lastName` as a *phone*
// fallback, so a lead named in `lastName` showed no name and risked showing a
// name where a phone was expected.
interface KylasIdentity {
  /** Digits as Kylas holds them, from `phoneNumbers`. */
  phone: string;
  /** Blank when Kylas's name is only the phone number repeated. */
  contactName: string;
  /** Kylas's own display name, phone-shaped or not. */
  displayName: string;
}

function kylasLeadIdentity(raw: Record<string, any>): KylasIdentity {
  const first = String(raw.firstName ?? '').trim();
  const last = String(raw.lastName ?? '').trim();
  const pn = Array.isArray(raw.phoneNumbers) && raw.phoneNumbers.length ? raw.phoneNumbers[0] : null;
  const phone = pn ? String(pn.value || pn.dialCode || '').trim() : '';
  const displayName = [first, last].filter(Boolean).join(' ');
  const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
  const nameIsPhone = !!displayName && !!phone && digits(displayName) === digits(phone);
  return { phone, contactName: nameIsPhone ? '' : displayName, displayName };
}

function mapInboundLead(raw: Record<string, any>): import('../../components/b2b/models/mockData').InboundLead {
  const { phone, contactName, displayName } = kylasLeadIdentity(raw);
  const kylasStage = typeof raw.pipelineStage === 'object' ? raw.pipelineStage?.id : raw.pipelineStage;
  // `city` holds the urgency in this instance; PRD's Timeline reads the same value.
  const urgency = cfString(raw, 'city');
  const sourceName = kylasIdName(raw, 'source', raw.source);
  return {
    id: String(raw.id),
    phone,
    // Never '—': the old mapper's placeholder got persisted to 150 rows.
    contactName,
    owner: B2B_INBOUND_OWNERS[raw.ownerId] || 'Unassigned',
    ownerId: typeof raw.ownerId === 'number' ? raw.ownerId : undefined,
    leadCreatedAt: raw.createdAt ? String(raw.createdAt) : undefined,
    qualificationTag: cfString(raw, 'companyZipcode'),
    presalesOwner: cfString(raw, 'cfPsOwner'),
    leadSummary: cfString(raw, 'cfSpaceRequirement'),
    urgency,
    pincode: cfString(raw, 'zipcode'),
    presalesClientType: cfString(raw, 'cfClientType'),
    presalesMissedCalls: cfCount(raw, 'cfMissedCallCount'),
    kylasStage: typeof kylasStage === 'number' ? kylasStage : undefined,
    source: mapInboundSource(sourceName ?? raw.source),

    stage: 'New',
    // Fallback headline only — the real one is `companyName`, which the Inbound
    // team fills (PRD §3.2).
    company: displayName || `Lead ${raw.id}`,
    value: 0,

    requirement: cfString(raw, 'requirementName'),
    selections: selectionsFromKylasLabels(
      categoryLabelsFromIds(cf(raw, 'cfCategoriesOfInterest')),
    ),

    // Retained aliases the shared boards still read.
    timeline: urgency,
    requirementBrief: cfString(raw, 'cfSpaceRequirement'),
    categories: categoryLabelsFromIds(cf(raw, 'cfCategoriesOfInterest')),
    // `expectedClosure` is deliberately NOT set from `expectedClosureOn`.
    calls: [],
    notes: [],
  };
}

export const B2B_INBOUND_PAGE_SIZE = 25;
const B2B_INBOUND_OWNER_IDS = Object.keys(B2B_INBOUND_OWNERS).map(Number);

export interface B2BInboundPage {
  leads: import('../../components/b2b/models/mockData').InboundLead[];
  page: number;
  hasMore: boolean;
  total: number;
}

export async function fetchB2BInboundLeads(
  page = 0,
  ownerIds: number[] = B2B_INBOUND_OWNER_IDS,
  search = '',
  createdAfter = '',
  createdBefore = '',
  kylasStage?: number,
): Promise<B2BInboundPage> {
  let res;
  try {
    res = await kylasFetch(`/search/lead?sort=createdAt,desc&page=${page}&size=${B2B_INBOUND_PAGE_SIZE}`, {
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
    : Math.ceil(total / B2B_INBOUND_PAGE_SIZE);
  return {
    leads: content.map(mapInboundLead),
    page,
    hasMore: page + 1 < totalPages,
    total,
  };
}

function stripHtml(s: unknown): string {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatKylasTs(ts: unknown): string {
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
  if (!ms || Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// Deal tickets for a B2B lead come from the Django `ticket` table (via /crm/leads/),
// matched on phone — more reliable than fuzzy-matching Kylas deals.
export async function fetchLeadDeals(phone: string | number): Promise<import('../../components/b2b/models/mockData').LeadDeal[]> {
  const q = String(phone || '').trim();
  if (!q) return [];
  try {
    const { results } = await fetchCRMLeads({ q, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' });
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

// Every deal ticket on a set of client phone numbers, as the raw rows, keyed by
// the number they were matched to. The Client Database's §3.2 Order Details
// table needs the per-ticket columns the aggregate endpoint does not carry
// (contact name, SPOC, dates), and `fetchLeadDeals` narrows those away.
//
// Two rules that are not in `fetchLeadDeals`:
//
//   The phone match is EXACT. `?q=` is an icontains over a cast of
//   client__contact, so querying 9900099013 also returns a ticket raised under
//   919900099013 or 99000990135 — a different client. `fetchLeadDeals` gets
//   away with it because `lookupEnqId` then matches the Enq ID exactly, but
//   here the rows themselves become a client's order history, and attributing
//   one client's order to another is the exact failure the Enq ID rule exists
//   to prevent. A row whose contact does not normalise to the number we asked
//   for is dropped and counted.
//
//   A failure is reported, not swallowed. `fetchLeadDeals` catches into `[]`,
//   which is indistinguishable from "this client has never enquired" — the
//   landmine this file already documents. Each phone resolves to its own
//   'ok' | 'failed' state so the UI can say which half it could not read.
export interface ClientTicketResult {
  phone: string;
  state: 'ok' | 'failed';
  rows: CRMLeadRow[];
  /** Rows the backend returned whose contact number is not this client's. */
  rejected: number;
  error?: string;
}

const normalizeTicketPhone = (v: string | null | undefined): string =>
  String(v || '').replace(/\D/g, '').slice(-10);

export async function fetchClientTickets(phone: string): Promise<ClientTicketResult> {
  const want = normalizeTicketPhone(phone);
  if (want.length !== 10) return { phone: want, state: 'ok', rows: [], rejected: 0 };
  try {
    const { results } = await fetchCRMLeads({ q: want, page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc' });
    const rows = Array.isArray(results) ? results : [];
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

export async function fetchLeadNotes(
  leadId: string | number,
  ownerId?: number,
): Promise<import('../../components/b2b/models/mockData').LeadNote[]> {
  const params = new URLSearchParams({
    targetEntityId: String(leadId),
    targetEntityType: 'LEAD',
    sort: 'createdAt,desc',
    page: '0',
    size: '10',
  });
  if (ownerId) params.set('targetEntityOwnerId', String(ownerId));
  try {
    const data = await kylasFetch(`/notes/relation?${params.toString()}`);
    const items = data?.content || (Array.isArray(data) ? data : []);
    return items
      .map((n: Record<string, any>) => ({
        ts: formatKylasTs(n.createdAt),
        author: n.createdBy?.name || n.updatedBy?.name || 'Kylas',
        text: stripHtml(n.description ?? n.note ?? n.body ?? ''),
      }))
      .filter((n: import('../../components/b2b/models/mockData').LeadNote) => n.text);
  } catch {
    return [];
  }
}

function pickName(v: unknown): string {
  if (v && typeof v === 'object') return String((v as { name?: string }).name || '');
  return String(v || '');
}

export async function fetchLeadCallLogs(
  leadId: string | number,
): Promise<import('../../components/b2b/models/mockData').CallLogEntry[]> {
  const body = {
    jsonRule: {
      rules: [{
        id: 'related_to', field: 'related_to', type: 'related_lookup',
        value: { entity: 'lead', id: String(leadId) }, operator: 'equal',
      }],
      condition: 'AND',
    },
  };
  try {
    const data = await kylasFetch('/call-logs/search?page=1&size=10&sort=createdAt,desc', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const items = data?.content || (Array.isArray(data) ? data : []);
    return items.map((c: Record<string, any>) => ({
      id: String(c.id),
      ts: formatKylasTs(c.createdAt ?? c.calledAt ?? c.startTime),
      direction: pickName(c.callType ?? c.type ?? c.direction) || 'Call',
      status: pickName(c.status ?? c.callStatus ?? c.outcome) || '—',
      durationSec: typeof c.duration === 'number' ? c.duration : undefined,
      by: c.createdBy?.name || c.owner?.name || c.calledBy?.name || '',
      note: stripHtml(c.notes ?? c.description ?? c.remark ?? ''),
    }));
  } catch {
    return [];
  }
}

export async function fetchCallLogSummary(callLogId: string | number): Promise<string> {
  const data = await kylasFetch(`/call-logs/${callLogId}?relatedToType=lead`);
  return stripHtml(data?.callSummary ?? data?.summary ?? data?.aiSummary ?? data?.transcriptSummary ?? '');
}

export type CallOutcome = 'connected' | 'busy' | 'rejected' | 'no_answer' | 'missed_call';

export const CALL_OUTCOME_OPTIONS: { value: CallOutcome; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'busy', label: 'Busy' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'missed_call', label: 'Missed Call' },
];

export async function createInboundCallLog(params: {
  leadId: string | number;
  leadName: string;
  phoneId: string | number;
  outcome: CallOutcome;
  callType?: 'outgoing' | 'incoming';
  callSummary?: string;
  durationMinutes?: number;   // only meaningful when outcome is 'connected'
  startTime?: string; // ISO; defaults to now
}): Promise<boolean> {
  const { leadId, leadName, phoneId, outcome, callType = 'outgoing', callSummary = '', durationMinutes, startTime } = params;
  const fd = new FormData();
  fd.append('isManual', 'true');
  fd.append('outcome', outcome);
  fd.append('startTime', startTime || new Date().toISOString());
  fd.append('phoneId', String(phoneId));
  fd.append('callType', callType);
  if (outcome === 'connected' && durationMinutes != null) {
    fd.append('duration', String(durationMinutes));
    fd.append('durationType', 'minutes');
  }
  fd.append('callSummary', callSummary);
  fd.append('notes', '[]');
  fd.append('relatedTo[id]', String(leadId));
  fd.append('relatedTo[name]', leadName);
  fd.append('relatedTo[entity]', 'lead');
  fd.append('relatedTo[phoneId]', String(phoneId));
  try {
    const res = await fetch(`${KYLAS_API_URL}/call-logs/`, {
      method: 'POST',
      headers: { 'api-key': KYLAS_API_KEY },
      body: fd,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return true;
  } catch {
    return false;
  }
}

export interface InboundLeadEdit {
  requirement?: string;
  /** PRD selections (`Tiles`, `Plywood`, …) — mapped to Kylas's own labels. */
  selections?: string[];
}

export interface KylasWriteResult {
  ok: boolean;
  error?: string;
  /** Selections Kylas has no picklist option for, so they stayed CRM-only. */
  dropped?: string[];
}

/**
 * Pushes the two shared fields back to Kylas.
 *
 * Returns a result rather than a boolean because the caller used to discard it:
 * a failed PATCH rendered as a successful save and the rep never knew Kylas and
 * the CRM had diverged. `Plywood` has no Kylas picklist option, so it is
 * reported in `dropped` instead of vanishing.
 */
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

// Live editable fields for a lead, straight from Kylas (used on drawer open).
export interface InboundLeadDetail extends InboundLeadEdit {
  /** Narrowed from the write type: a read always yields known PRD selections. */
  selections?: Selection[];
  /** Kylas's own name for the lead — often the phone number repeated. */
  kylasName?: string;
  /** Blank when Kylas's name is just the phone number again. */
  contactName?: string;
  leadSummary?: string;
  urgency?: string;
  pincode?: string;
  presalesOwner?: string;
  presalesClientType?: string;
  presalesMissedCalls?: number;
  qualificationTag?: string;
  leadCreatedAt?: string;
  phoneId?: number;
  phone?: string;
  /** False when the lookup failed — the caller must not treat blanks as real. */
  loaded: boolean;
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

export async function createLeadNote(
  leadId: string | number,
  text: string,
): Promise<boolean> {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = {
    sourceEntity: { description: `<div>${escaped}</div>`, mentions: null },
    targetEntityId: String(leadId),
    targetEntityType: 'LEAD',
  };
  try {
    await kylasFetch('/notes/relation', { method: 'POST', body: JSON.stringify(body) });
    return true;
  } catch {
    return false;
  }
}

export function getKylasRedirectUrl(leadId: number, contactId?: number): string {
  return contactId
    ? `https://app.kylas.io/sales/contacts/details/${contactId}`
    : `https://app.kylas.io/sales/leads/details/${leadId}`;
}

export function getKylasDealUrl(dealId: number | string): string {
  return `https://app.kylas.io/sales/deals/details/${dealId}`;
}

