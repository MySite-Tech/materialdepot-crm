
const API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";
const KYLAS_API_URL = "https://api.kylas.io/v1";
const KYLAS_API_KEY = "84ff1db2-99bf-4634-9e24-1930c1cfcd6a:20007";

const TOKEN_KEY = 'jwt_token';
const REFRESH_KEY = 'refresh_token';

export function getToken(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || '';
}

function getRefreshToken(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(REFRESH_KEY)) || '';
}

function saveToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

function saveRefreshToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

function forceReLogin() {
  clearToken();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('materialdepot_user');
    window.location.reload();
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.access) return false;
    saveToken(data.access);
    if (data.refresh) saveRefreshToken(data.refresh);
    return true;
  } catch {
    return false;
  }
}

// Shared fetch helpers
async function mdFetch(path: string, init?: RequestInit, retried = false): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  // Backend returns 403 (not 401) for unauthenticated requests because
  // SessionAuthentication is first in DRF's auth classes — treat both the same.
  if ((res.status === 401 || res.status === 403) && !retried) {
    if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    const ok = await refreshPromise;
    if (ok) return mdFetch(path, init, true);
    forceReLogin();
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export interface EscalationRaisedBy {
  raised_by: string | null;
  raised_at?: string | null;
  reason?: string[] | null;
}

export async function getEscalationRaisedBy(dealId: number | string): Promise<EscalationRaisedBy | null> {
  try {
    return await mdFetch(`/escalation-raised-by/?deal_id=${encodeURIComponent(String(dealId))}`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OTP Auth
// ---------------------------------------------------------------------------

export async function sendOtp(phone: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/login-otp/?contact=${phone}&country_code=91`);
  if (!res.ok) throw new Error(`Failed to send OTP: ${res.status}`);
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/verify-otp/?contact=${phone}&otp=${otp}`);
  if (!res.ok) return false;
  try {
    const data = await res.json();
    if (data?.token) saveToken(data.token);
    if (data?.refresh) saveRefreshToken(data.refresh);
  } catch {}
  return true;
}

async function kylasFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${KYLAS_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "api-key": KYLAS_API_KEY, ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export interface Branch { id: number; name: string; displayName: string }

export async function fetchBranches(): Promise<Branch[]> {
  const data = await kylasFetch("/fields/2215123");
  return (data.field?.picklist?.values || [])
    .filter((v: { deleted: boolean; disabled: boolean }) => !v.deleted && !v.disabled)
    .map((v: { id: number; name: string; displayName: string }) => ({
      id: v.id, name: v.name, displayName: v.displayName,
    }));
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface CurrentSalesBM {
  bm_contact: string;
  f_name: string;
  l_name: string;
  crm_id: string;
}

export interface UserProperties {
  [propertyId: number]: string;
}

export interface LookupResponse {
  success: boolean;
  userId: string;
  newVisit: boolean;
  name: string;
  footfallCount: number;
  currentSalesBM?: CurrentSalesBM;
  userProperties?: UserProperties;
}

export async function lookupLeadByPhone(phoneNumber: string, branch: string): Promise<LookupResponse> {
  const data = await mdFetch("/store-visit-lead/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact: phoneNumber, branch: branch.toUpperCase() }),
  });
  return {
    success: true,
    userId: data.user_id,
    newVisit: data.new_visit,
    name: data.name || '',
    footfallCount: data.footfall_count || 0,
    currentSalesBM: data.current_sales_bm,
    userProperties: data.user_properties,
  };
}

export async function syncLeadToKylas(
  phoneNumber: string,
  branch: string,
  interestedCategories: string[],
  userType: string,
  name?: string,
): Promise<void> {
  await mdFetch("/store-visit-lead/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contact: phoneNumber,
      branch: branch.toUpperCase(),
      interested_categories: interestedCategories,
      user_type: userType,
      ...(name ? { name } : {}),
    }),
  });
}

// ---------------------------------------------------------------------------
// User Info Properties (questions + options from Django)
// ---------------------------------------------------------------------------

export interface UserInfoProperty {
  id: number;
  name: string;
  options: string[] | null;
  required: boolean;
}

export async function fetchUserInfoProperties(ids: number[]): Promise<UserInfoProperty[]> {
  const data: UserInfoProperty[] = await mdFetch('/user-info-property/');
  return data.filter(p => ids.includes(p.id));
}

export async function saveUserProperties(
  userId: string,
  properties: Array<{ property_id: number; value: string }>,
): Promise<void> {
  await mdFetch('/user-property/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, properties }),
  });
}

export async function updateLead(
  leadId: number,
  fullLeadBody: Record<string, unknown>,
  customFieldValues: Record<string, unknown>,
  contact: string,
  name?: string,
): Promise<{ success: boolean; leadId: number; conversionDetails?: Array<{ entityType: string; entityId: number }> }> {
  const data = await kylasFetch(`/leads/${leadId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...fullLeadBody,
      firstName: name?.trim() || contact,
      lastName: contact,
      customFieldValues: { ...((fullLeadBody.customFieldValues as Record<string, unknown>) || {}), ...customFieldValues },
    }),
  });
  return { success: true, leadId: data.id, conversionDetails: data.conversionDetails };
}

export async function fetchLeadById(leadId: number): Promise<{
  fullLeadBody: Record<string, unknown>;
  conversionDetails?: Array<{ entityType: string; entityId: number }>;
}> {
  const data = await kylasFetch(`/leads/${leadId}`);
  return { fullLeadBody: data, conversionDetails: data.conversionDetails };
}

export async function searchContactByPhone(phoneNumber: string): Promise<number | null> {
  try {
    const data = await kylasFetch("/search/global-search", {
      method: "POST",
      body: JSON.stringify({ query: phoneNumber, entities: ["CONTACT"] }),
    });
    const contact = data.content?.find((item: { entityType: string }) => item.entityType === "CONTACT");
    return contact?.values?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// B2B Inbound Leads — Kylas pipeline 31627, stage 220514 (Hardi & Mandeep)
// ---------------------------------------------------------------------------

const B2B_INBOUND_PIPELINE = 31627;
const B2B_INBOUND_STAGE = 220514;
const B2B_INBOUND_OWNERS: Record<number, string> = {
  81181: 'Hardi',
  73321: 'Mandeep',
};

const B2B_INBOUND_FIELDS = [
  'firstName', 'lastName', 'ownerId', 'pipelineStage', 'phoneNumbers', 'zipcode',
  'actualClosureDate', 'source', 'createdAt', 'updatedAt', 'cfBranch',
  'cfSpaceRequirement', 'requirementName', 'city', 'id', 'recordActions', 'customFieldValues',
];

function b2bInboundRule(ownerId: number) {
  return {
    fields: B2B_INBOUND_FIELDS,
    jsonRule: {
      rules: [
        { operator: 'equal', id: 'ownerId', field: 'ownerId', type: 'long', value: ownerId, relatedFieldIds: null },
        { operator: 'equal', id: 'pipeline', field: 'pipeline', type: 'long', value: B2B_INBOUND_PIPELINE, dependentFieldIds: ['pipelineStage', 'pipelineStageReason'] },
        { operator: 'equal', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: B2B_INBOUND_STAGE, relatedFieldIds: ['pipeline'] },
      ],
      condition: 'AND',
      valid: true,
    },
  };
}

function mapInboundSource(raw: unknown): import('../app/b2b/mockData').InboundLead['source'] {
  const name = (typeof raw === 'object' && raw ? (raw as { name?: string }).name : String(raw || '')).toLowerCase();
  if (name.includes('whatsapp')) return 'WhatsApp';
  if (name.includes('referral')) return 'Referral';
  if (name.includes('walk')) return 'Walk-in';
  if (name.includes('google')) return 'Google';
  if (name.includes('web') || name.includes('form')) return 'Website form';
  return 'Other';
}

function mapInboundLead(raw: Record<string, any>): import('../app/b2b/mockData').InboundLead {
  const firstName = String(raw.firstName || '').trim();
  const lastName = String(raw.lastName || '').trim();
  const phone = Array.isArray(raw.phoneNumbers) && raw.phoneNumbers.length
    ? String(raw.phoneNumbers[0]?.value || raw.phoneNumbers[0]?.dialCode || '')
    : lastName;
  return {
    id: String(raw.id),
    company: firstName || lastName || `Lead ${raw.id}`,
    contactName: firstName || '—',
    phone,
    ownerId: typeof raw.ownerId === 'number' ? raw.ownerId : undefined,
    accountType: 'Retailer',
    stage: 'New',
    priority: 'Medium',
    owner: B2B_INBOUND_OWNERS[raw.ownerId] || 'Unassigned',
    source: mapInboundSource(raw.source),
    urgency: 'Planning',
    value: 0,
    requirement: raw.requirementName ?? raw.customFieldValues?.requirementName ?? undefined,
    timeline: raw.city ?? raw.customFieldValues?.city ?? undefined,
    expectedClosure: raw.actualClosureDate || undefined,
    calls: [],
    notes: [],
  };
}

export async function fetchB2BInboundLeads(): Promise<import('../app/b2b/mockData').InboundLead[]> {
  const owners = Object.keys(B2B_INBOUND_OWNERS).map(Number);
  const responses = await Promise.all(
    owners.map((ownerId) =>
      kylasFetch('/search/lead?sort=createdAt,desc&page=0&size=100', {
        method: 'POST',
        body: JSON.stringify(b2bInboundRule(ownerId)),
      }).catch(() => ({ content: [] })),
    ),
  );
  const seen = new Set<string>();
  const leads: import('../app/b2b/mockData').InboundLead[] = [];
  for (const res of responses) {
    for (const raw of (res?.content || [])) {
      const id = String(raw.id);
      if (seen.has(id)) continue;
      seen.add(id);
      leads.push(mapInboundLead(raw));
    }
  }
  return leads;
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

export async function fetchLeadNotes(
  leadId: string | number,
  ownerId?: number,
): Promise<import('../app/b2b/mockData').LeadNote[]> {
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
      .filter((n: import('../app/b2b/mockData').LeadNote) => n.text);
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
): Promise<import('../app/b2b/mockData').CallLogEntry[]> {
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

export async function updateLeadRequirement(
  leadId: string | number,
  requirementName: string,
): Promise<boolean> {
  try {
    await kylasFetch(`/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ requirementName }),
    });
    return true;
  } catch {
    return false;
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

// ---------------------------------------------------------------------------
// Store visit — BMs & assignment
// ---------------------------------------------------------------------------

export interface BMOption { user_id: string; bm_contact: string; f_name: string; l_name: string; crm_id: string }

export async function fetchBMsByBranch(branch: string): Promise<BMOption[]> {
  return mdFetch(`/store-visit/bms-by-branch/?branch=${encodeURIComponent(branch.toUpperCase())}`);
}

export interface AssignBMResponse {
  assignment_id: number;
  created: boolean;
  reactivated: boolean;
}

export async function assignBMToClient(
  clientContact: string,
  bmContact: string,
  kylasLeadId?: number,
): Promise<AssignBMResponse> {
  return mdFetch("/store-visit/assign-bm/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_contact: clientContact, bm_contact: bmContact, kylas_lead_id: kylasLeadId }),
  });
}

// ---------------------------------------------------------------------------
// CRM Leads from backend
// ---------------------------------------------------------------------------

export interface CRMLeadRow {
  id: string;
  clientName: string | null;
  clientPhone: string | null;
  assignedTo: string;
  branch: string;
  status: string;
  cartValue: number;
  cartItems: string;
  clientType: string;
  propertyType: string;
  architectInvolved: boolean;
  projectPhase: string;
  followUpDate: string;
  closureDate: string;
  lostMarkDate: string;
  lostReason: string;
  createdAt: string;
  visits: { date: string; channel: string }[];
  remarks: { ts: string; author: string; text: string }[];
}

export interface CRMLeadsPage {
  results: CRMLeadRow[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CRMLeadsQuery {
  page?: number;
  pageSize?: number; // 25..100, clamped server-side
  branch?: string;
  bm?: string;
  q?: string;
  status?: string;            // CSV of CRM-vocabulary statuses
  createdFrom?: string;       // YYYY-MM-DD
  createdTo?: string;
  followupFrom?: string;
  followupTo?: string;
  closureFrom?: string;
  closureTo?: string;
  lostFrom?: string;           // Lost Mark Date range (deal resolution date)
  lostTo?: string;
  cartValueGt?: number;
  cartValueLt?: number;
  ownerUserOrgId?: string | number;
  sortBy?: 'createdAt' | 'clientName' | 'clientPhone' | 'assignedTo' | 'branch' | 'cartValue';
  sortDir?: 'asc' | 'desc';
  taskFilter?: string;
  category?: string;          // CSV of category names
}

export interface CRMLeadsStatsBucket { count: number; value: number }
export interface CRMLeadsStatsByStatus { status: string; count: number; value: number }
export interface CRMLeadsStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStatsByStatus[];
}

export async function fetchCRMLeadsStats(query: Omit<CRMLeadsQuery, 'page' | 'pageSize'> = {}): Promise<CRMLeadsStats> {
  const params = new URLSearchParams();
  if (query.branch) params.set('branch', query.branch);
  if (query.bm) params.set('bm', query.bm);
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.createdFrom) params.set('created_from', query.createdFrom);
  if (query.createdTo) params.set('created_to', query.createdTo);
  if (query.followupFrom) params.set('followup_from', query.followupFrom);
  if (query.followupTo) params.set('followup_to', query.followupTo);
  if (query.closureFrom) params.set('closure_from', query.closureFrom);
  if (query.closureTo) params.set('closure_to', query.closureTo);
  if (query.lostFrom) params.set('lost_from', query.lostFrom);
  if (query.lostTo) params.set('lost_to', query.lostTo);
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.cartValueLt !== undefined && query.cartValueLt !== null && !Number.isNaN(query.cartValueLt)) {
    params.set('cart_value_lt', String(query.cartValueLt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
  if (query.taskFilter) params.set('task_filter', query.taskFilter);
  if (query.category) params.set('category', query.category);
  const qs = params.toString();
  const data = await mdFetch(`/crm/leads/stats/${qs ? `?${qs}` : ''}`);
  return {
    total: data.total || { count: 0, value: 0 },
    active: data.active || { count: 0, value: 0 },
    won: data.won || { count: 0, value: 0 },
    lost: data.lost || { count: 0, value: 0 },
    byStatus: data.byStatus || [],
  };
}

export async function fetchCRMLeads(query: CRMLeadsQuery = {}): Promise<CRMLeadsPage> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('page_size', String(query.pageSize));
  if (query.branch) params.set('branch', query.branch);
  if (query.bm) params.set('bm', query.bm);
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.createdFrom) params.set('created_from', query.createdFrom);
  if (query.createdTo) params.set('created_to', query.createdTo);
  if (query.followupFrom) params.set('followup_from', query.followupFrom);
  if (query.followupTo) params.set('followup_to', query.followupTo);
  if (query.closureFrom) params.set('closure_from', query.closureFrom);
  if (query.closureTo) params.set('closure_to', query.closureTo);
  if (query.lostFrom) params.set('lost_from', query.lostFrom);
  if (query.lostTo) params.set('lost_to', query.lostTo);
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.cartValueLt !== undefined && query.cartValueLt !== null && !Number.isNaN(query.cartValueLt)) {
    params.set('cart_value_lt', String(query.cartValueLt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
  if (query.taskFilter) params.set('task_filter', query.taskFilter);
  if (query.category) params.set('category', query.category);
  if (query.sortBy) params.set('sort_by', query.sortBy);
  if (query.sortDir) params.set('sort_dir', query.sortDir);
  const qs = params.toString();
  const data = await mdFetch(`/crm/leads/${qs ? `?${qs}` : ''}`);
  return {
    results: data.results || [],
    count: data.count || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 25,
    totalPages: data.totalPages || 1,
  };
}

// ---------------------------------------------------------------------------
// CRM Dashboard aggregates from backend
// ---------------------------------------------------------------------------

export interface DashboardStatusDatum { status: string; count: number; value: number }
export interface DashboardBranchStatus {
  branch: string;
  total: number;
  totalValue: number;
  statuses: DashboardStatusDatum[];
}
export interface DashboardLostReason { reason: string; count: number; value: number; pct: number }
export interface DashboardClosureLead {
  id: string;
  clientName: string | null;
  clientPhone: string | null;
  assignedTo: string;
  branch: string;
  closureDate: string;
  status: string;
  cartValue: number;
}
export interface DashboardSummary {
  total: number;
  todayClosureCount: number;
  todayClosureValue: number;
  weekClosureCount: number;
  weekClosureValue: number;
  weekFrom: string;
  weekTo: string;
  today: string;
}
export interface DashboardData {
  branchStatus: DashboardBranchStatus[];
  lostReasons: DashboardLostReason[];
  closurePipeline: DashboardClosureLead[];
  summary: DashboardSummary;
}

export interface DashboardFilters {
  branch?: string[];
  bm?: string[];
  closureFrom?: string;
  closureTo?: string;
  createdFrom?: string;
  createdTo?: string;
  category?: string[];
}

export interface FootfallFunnelStats {
  footfall_users: number;
  cart_users: number;
  pi_users: number;
  order_users: number;
  cart_pct: number;
  pi_pct: number;
  order_pct: number;
}
export interface FootfallBMRow extends FootfallFunnelStats {
  bm_name: string;
}
export interface FootfallBranchRow extends FootfallFunnelStats {
  branch: string;
}
export interface FootfallDashboardData extends FootfallFunnelStats {
  by_bm: FootfallBMRow[];
  by_branch: FootfallBranchRow[];
}
export interface FootfallFilters {
  branch?: string[];
  bm?: string[];
  dateFrom?: string;
  dateTo?: string;
  category?: string[];
}
export interface FootfallNonConvertedRow {
  user_id: number;
  name: string;
  contact: string;
  bm: string;
}
export interface FootfallNonConvertedPage {
  results: FootfallNonConvertedRow[];
  count: number;
  page: number;
  total_pages: number;
}
export interface FootfallNoCartRow {
  user_id: number;
  name: string;
  contact: string;
  bm: string;
  has_deal_ticket?: boolean;
}
export interface FootfallNoCartPage {
  results: FootfallNoCartRow[];
  count: number;
  page: number;
  total_pages: number;
}
export async function fetchFootfallNoCart(
  filters: FootfallFilters & { page?: number; pageSize?: number; q?: string },
): Promise<FootfallNoCartPage> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-no-cart/${qs ? `?${qs}` : ''}`);
}

export async function fetchFootfallNonConverted(
  filters: FootfallFilters & { page?: number; pageSize?: number; q?: string },
): Promise<FootfallNonConvertedPage> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-non-converted/${qs ? `?${qs}` : ''}`);
}

export interface FootfallRepeatRow {
  bucket: string;
  unique_clients: number;
  orders_current: number;
  orders_till_last: number;
  sales_current: number;
  sales_till_last: number;
  aov_current: number;
  aov_till_last: number;
}
export interface FootfallRepeatData {
  rows: FootfallRepeatRow[];
  total: FootfallRepeatRow;
  current_month: string;
}
export async function fetchFootfallRepeat(
  filters: { branch?: string[]; dateFrom?: string; dateTo?: string } = {},
): Promise<FootfallRepeatData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-repeat/${qs ? `?${qs}` : ''}`);
}

export type FootfallBreakdownKind = 'int' | 'money' | 'pct';
export interface FootfallBreakdownRow {
  key: string;
  label: string;
  comment: string;
  kind: FootfallBreakdownKind;
  values: Record<string, number>;
  total: number;
}
export interface FootfallBreakdownData {
  stores: string[];
  rows: FootfallBreakdownRow[];
}
export async function fetchFootfallBreakdown(filters: FootfallFilters = {}): Promise<FootfallBreakdownData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/footfall-breakdown/${qs ? `?${qs}` : ''}`);
}

export async function fetchFootfallDashboard(filters: FootfallFilters = {}): Promise<FootfallDashboardData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/footfall-dashboard/${qs ? `?${qs}` : ''}`);
}

export async function markLeadLost(cartNumber: string, lostReason: string, ticketId?: number): Promise<void> {
  await mdFetch('/crm/lead-status/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart_number: cartNumber, lost_reason: lostReason, ...(ticketId ? { ticket_id: ticketId } : {}) }),
  });
}

export interface OrderLostBranchSummary {
  branch: string;
  totalCount: number; totalValue: number;
  activeCount: number; activeValue: number;
  wonCount: number; wonValue: number;
  lostCount: number; lostValue: number;
  groupCount: { Category: number; Retail: number; Other: number };
  groupValue: { Category: number; Retail: number; Other: number };
  reasonCount?: { Category: Record<string, number>; Retail: Record<string, number>; Other: Record<string, number> };
  reasonValue?: { Category: Record<string, number>; Retail: Record<string, number>; Other: Record<string, number> };
}

export interface OrderLostSummaryFilters {
  branch?: string[];
  bm?: string[];
  category?: string[];
  createdFrom?: string;
  createdTo?: string;
  cartValueGt?: number;
  cartValueLt?: number;
}

export async function fetchOrderLostSummary(filters: OrderLostSummaryFilters = {}): Promise<OrderLostBranchSummary[]> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
  if (filters.cartValueGt !== undefined && filters.cartValueGt !== null && !Number.isNaN(filters.cartValueGt)) {
    params.set('cart_value_gt', String(filters.cartValueGt));
  }
  if (filters.cartValueLt !== undefined && filters.cartValueLt !== null && !Number.isNaN(filters.cartValueLt)) {
    params.set('cart_value_lt', String(filters.cartValueLt));
  }
  const qs = params.toString();
  const data = await mdFetch(`/crm/order-lost-summary/${qs ? `?${qs}` : ''}`);
  return data?.branches ?? [];
}

export async function fetchDashboardData(filters: DashboardFilters = {}): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.closureFrom) params.set('closure_from', filters.closureFrom);
  if (filters.closureTo) params.set('closure_to', filters.closureTo);
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/dashboard/${qs ? `?${qs}` : ''}`);
}

// ---------------------------------------------------------------------------
// Client properties from backend (UserProperty table)
// ---------------------------------------------------------------------------

export interface ClientProperties {
  client_type?: string;
  property_type?: string;
  architect_involved?: string;
  followup_date?: string;
  project_phase?: string;
}

export async function fetchClientProperties(contacts: string[]): Promise<Record<string, ClientProperties>> {
  if (!contacts.length) return {};
  try {
    return await mdFetch(`/store-visit/client-properties/?contacts=${contacts.join(",")}`);
  } catch {
    return {};
  }
}

export interface LeadPropertyUpdate {
  name?: string;
  client_type?: string;
  property_type?: string;
  architect_involved?: string;
  followup_date?: string;
  project_phase?: string;
  estimated_closure_date?: string;
}


export async function updateLeadProperties(
  contact: string,
  fields: LeadPropertyUpdate,
  dealTicketId?: number,
): Promise<void> {
  if (!contact) return;
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null)
  );
  if (!Object.keys(payload).length) return;
  await mdFetch("/store-visit/client-properties/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact, ...payload, ...(dealTicketId ? { deal_ticket_id: dealTicketId } : {}) }),
  });
}

// ---------------------------------------------------------------------------
// BM Client-Info Tasks
// ---------------------------------------------------------------------------

export interface ClientInfoTask {
  id: number;
  client: { id: number; name: string; contact: string } | null;
  followup_date: string | null;
  status: string;
  created_at: string;
  modified_at: string;
}

export interface ClientInfoProperty {
  id: number;
  name: string;
  options: string[] | null;
  required: boolean;
  value: string | null;
}

export interface ClientInfoTaskDetail extends ClientInfoTask {
  properties: ClientInfoProperty[];
}

export interface SaveAnswersResponse {
  ticket_id: number;
  saved_property_ids: number[];
}

const bmHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function fetchClientInfoTasks(token: string): Promise<ClientInfoTask[]> {
  return mdFetch("/order/bm/client-info-tasks/", { headers: bmHeaders(token) });
}

export async function fetchPendingFollowupTasks(token: string): Promise<ClientInfoTask[]> {
  return mdFetch("/order/bm/client-info-tasks/pending-followup/", { headers: bmHeaders(token) });
}

export async function fetchClientInfoTaskDetail(token: string, ticketId: number): Promise<ClientInfoTaskDetail> {
  return mdFetch(`/order/bm/client-info-tasks/${ticketId}/`, { headers: bmHeaders(token) });
}

export async function saveClientInfoAnswers(
  token: string,
  ticketId: number,
  answers: { property_id: number; value: string }[],
): Promise<SaveAnswersResponse> {
  return mdFetch(`/order/bm/client-info-tasks/${ticketId}/answers/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bmHeaders(token) },
    body: JSON.stringify({ answers }),
  });
}

// ---------------------------------------------------------------------------
// CRM Auth — replaces Supabase loginWithPhone
// ---------------------------------------------------------------------------

const EXCLUDED_ROLES = new Set(['data', 'delivery']);

export async function loginWithPhone(phone: string): Promise<import('../types/crm').AppUser | null> {
  try {
    const data = await mdFetch(`/crm/user-profile/?phone=${phone}`);
    if (!data) return null;
    if (EXCLUDED_ROLES.has(data.role)) return null;
    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      role: data.role,
      allowedBranches: data.allowedBranches || [],
      individualPermissions: data.individualPermissions || [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CRM Users — replaces Supabase users table
// ---------------------------------------------------------------------------

const PERMISSION_ID_TO_ROLE: Record<number, string> = {
  1: 'admin', 2: 'manager', 3: 'sales', 4: 'pre_sales', 5: 'procurement',
  6: 'delivery', 7: 'tech', 8: 'data', 9: 'accounts', 10: 'retail',
  11: 'customer_success', 12: 'store_manager', 13: 'delivery_manager',
  14: 'b2b_sales', 15: 'post_sales',
};

function _mapUserOrg(u: Record<string, unknown>): import('../types/crm').AppUser {
  const user = u.user as Record<string, unknown> | null;
  const perm = u.user_permission_detail as Record<string, unknown> | null;
  const branches = (u.branch as Array<Record<string, unknown>>) || [];
  const fname = ((user?.f_name as string) || '').trim();
  const lname = ((user?.l_name as string) || '').trim();
  const role = (perm?.permission_name as string) || PERMISSION_ID_TO_ROLE[perm?.id as number] || '';
  return {
    id: u.id as number,
    name: [fname, lname].filter(Boolean).join(' ') || String(user?.contact || ''),
    phone: String(user?.contact || ''),
    role,
    allowedBranches: branches.map((b) => b.branch_name as string).filter(Boolean),
    individualPermissions: Array.isArray(u.individual_permissions)
      ? (u.individual_permissions as string[])
      : [],
  };
}

export async function fetchUsers(): Promise<import('../types/crm').AppUser[]> {
  const data = await mdFetch('/user-organisation/');
  return (data || []).map(_mapUserOrg).filter((u: import('../types/crm').AppUser) => !EXCLUDED_ROLES.has(u.role));
}

export async function addUser({ name, phone, role }: { name: string; phone: string; role: string }): Promise<import('../types/crm').AppUser> {
  const data = await mdFetch('/user-organisation/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact: phone, name, role }),
  });
  return _mapUserOrg(data);
}

export async function updateUser(id: string | number, updates: Partial<import('../types/crm').AppUser>): Promise<void> {
  await mdFetch(`/user-organisation/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteUser(id: string | number): Promise<void> {
  await mdFetch(`/user-organisation/${id}/`, { method: 'DELETE' });
}

export async function updateUserBranches(id: string | number, branches: string[]): Promise<void> {
  await mdFetch(`/user-organisation/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branches }),
  });
}

// ---------------------------------------------------------------------------
// Branches — uses existing /orgainsation-branch/ endpoints
// ---------------------------------------------------------------------------

export async function fetchBranchList(): Promise<import('../types/crm').Branch[]> {
  const data = await mdFetch('/orgainsation-branch/');
  return (data?.results || data || []).map((b: { id: number; branch_name: string }) => ({ id: b.id, name: b.branch_name }));
}

export async function addBranch(name: string): Promise<import('../types/crm').Branch> {
  const data = await mdFetch('/orgainsation-branch/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_name: name }),
  });
  return { id: data.id, name: data.name || name };
}

export async function updateBranch(id: string | number, name: string): Promise<void> {
  await mdFetch(`/orgainsation-branch/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_name: name }),
  });
}

export async function deleteBranch(id: string | number): Promise<void> {
  await mdFetch(`/orgainsation-branch/${id}/`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// CRM Lead Remarks — replaces Supabase remarks in leads table
// ---------------------------------------------------------------------------

export async function fetchLeadRemarks(ticketId: number): Promise<import('../types/crm').Remark[]> {
  if (!ticketId) return [];
  try {
    const data = await mdFetch(`/crm/lead-remarks/?ticket_id=${ticketId}`);
    return (data || []) as import('../types/crm').Remark[];
  } catch {
    return [];
  }
}

export async function appendRemarkToLead(
  ticketId: number,
  remark: import('../types/crm').Remark,
  authorPhone?: string,
): Promise<import('../types/crm').Remark[]> {
  if (!ticketId) return [remark];
  await mdFetch('/crm/lead-remarks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, text: remark.text, author_phone: authorPhone || '' }),
  });
  return fetchLeadRemarks(ticketId);
}

// ---------------------------------------------------------------------------
// CRM Lead Visits — replaces Supabase visits in leads table
// ---------------------------------------------------------------------------

export async function fetchLeadVisits(clientPhone: string): Promise<import('../types/crm').Visit[]> {
  if (!clientPhone) return [];
  try {
    const data = await mdFetch(`/crm/lead-visits/?client_phone=${clientPhone}`);
    return (data || []) as import('../types/crm').Visit[];
  } catch {
    return [];
  }
}

export async function appendVisit(
  clientPhone: string,
  visit: import('../types/crm').Visit,
  loggedByPhone?: string,
): Promise<void> {
  if (!clientPhone) return;
  await mdFetch('/crm/lead-visits/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_phone: clientPhone, channel: visit.channel, logged_by_phone: loggedByPhone || '' }),
  });
}

// ---------------------------------------------------------------------------
// CRM Lead upsert / fetch / create / delete — replaces Supabase leads table
// ---------------------------------------------------------------------------

export async function upsertLead(lead: import('../types/crm').Lead): Promise<void> {
  if (!lead.clientPhone) return;
  await updateLeadProperties(lead.clientPhone, {
    client_type: lead.clientType || undefined,
    property_type: lead.propertyType || undefined,
    architect_involved: lead.architectInvolved ? 'yes' : 'no',
    followup_date: lead.followUpDate || undefined,
    project_phase: lead.projectPhase || undefined,
    estimated_closure_date: lead.closureDate || undefined,
  }, lead.ticketId);
}

export async function upsertLeads(leads: import('../types/crm').Lead[]): Promise<void> {
  await Promise.all(leads.map(l => upsertLead(l).catch(() => {})));
}

export async function fetchLead(id: string, clientPhone?: string): Promise<import('../types/crm').Lead> {
  const phone = clientPhone || id;
  const data = await mdFetch(`/crm/leads/?q=${phone}&page_size=5`);
  const results: import('../types/crm').Lead[] = data?.results || [];
  const found = results.find(r => r.id === id || r.clientPhone === phone);
  if (!found) throw new Error(`Lead not found: ${id}`);
  return found;
}

export async function createLead(lead: import('../types/crm').Lead, bmPhone: string): Promise<void> {
  if (!lead.clientPhone || !bmPhone) return;
  await mdFetch('/crm/create-lead/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_phone: lead.clientPhone,
      client_name: lead.clientName || '',
      assigned_to_phone: bmPhone,
    }),
  });
  await upsertLead(lead);
}

export async function deleteLead(_id: string, _clientPhone?: string): Promise<void> {
  // Leads cannot be deleted from the backend; no-op.
}

// ---------------------------------------------------------------------------
// Kylas — sync estimate to deal
// ---------------------------------------------------------------------------

export interface SyncEstimateResult {
  success: boolean;
  mode?: string;
  estimate_id?: number;
  lead_id?: string;
  estimate_status?: string;
  deal_id?: number | string;
  message?: string;
  queued?: boolean;
  error?: string;
}

export interface KylasDealInfo {
  id: number;
  name: string;
  ownerName: string | null;
  stageName: string | null;
  pipelineName: string | null;
}

function detectInputType(value: string): { lead_id?: string; estimate_id?: number; user_id?: string; cart_number?: string } {
  const trimmed = value.trim();
  // UUID pattern → user_id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { user_id: trimmed };
  }
  if (/^CT/i.test(trimmed)) {
    return { cart_number: trimmed };
  }
  // All digits → estimate_id
  if (/^\d+$/.test(trimmed)) {
    return { estimate_id: parseInt(trimmed, 10) };
  }
  // Otherwise → lead_id (ENQ..., etc.)
  return { lead_id: trimmed };
}

export async function syncEstimate(value: string): Promise<SyncEstimateResult> {
  const payload = detectInputType(value);
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/kylas/sync-estimate/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const msg =
      data?.error || data?.message || data?.detail || `API error: ${res.status}`;
    return { success: false, error: msg };
  }
  return data ?? { success: false, error: `API error: ${res.status}` };
}

// ---------------------------------------------------------------------------
// Weekly Funnel Dashboard
// ---------------------------------------------------------------------------

export interface WeeklyFunnelRow {
  week: string;
  customer_type: string;
  footfall: number;
  cart: number;
  cart_pct: number;
  pi: number;
  pi_pct: number;
  order: number;
  order_pct: number;
  order_value: number;
  avg_order_value: number;
  avg_category: number;
}

export interface MonthSplitRow {
  month: string;
  '0-25k': number;
  '25-50k': number;
  '50-100k': number;
  '100k-250k': number;
  '250k-500k': number;
  '500k+': number;
  total: number;
}

export interface CategorySplitRow {
  month: string;
  [category: string]: number | string;
}

export interface WeeklyFunnelData {
  weekly_rows: WeeklyFunnelRow[];
  cart_split_by_month: MonthSplitRow[];
  order_split_by_month: MonthSplitRow[];
  category_split_by_month: {
    top_categories: string[];
    rows: CategorySplitRow[];
  };
  category_revenue_split_by_month: {
    top_categories: string[];
    rows: CategorySplitRow[];
  };
}

export interface WeeklyFunnelFilters {
  branch?: string[];
  bm?: string[];
  dateFrom?: string; // YYYY-MM-DD, inclusive — lower bound of the visible range
  dateTo?: string;   // YYYY-MM-DD, inclusive — anchor: W-0 is the 7 days ending on this date
  category?: string[];
}

export async function fetchWeeklyFunnel(filters: WeeklyFunnelFilters = {}): Promise<WeeklyFunnelData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/weekly-funnel/${qs ? `?${qs}` : ''}`);
}

export interface CategoryOption { id: number; name: string }

export async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  const data = await mdFetch('/category-list-all/');
  return (data || [])
    .map((c: { id: number; category_name: string | null }) => ({ id: c.id, name: (c.category_name || '').trim() }))
    .filter((c: CategoryOption) => c.name);
}

export interface AvailableBM { name: string; contact: string }

export async function fetchAvailableBMs(branch?: string[]): Promise<AvailableBM[]> {
  const params = new URLSearchParams();
  if (branch?.length) params.set('branch', branch.join(','));
  const qs = params.toString();
  const data = await mdFetch(`/crm/available-bms/${qs ? `?${qs}` : ''}`);
  return data?.available_bms ?? [];
}

// ---------------------------------------------------------------------------
// Report Card
// ---------------------------------------------------------------------------

export interface WalkinRow {
  walkins: number;
  carts_created: number;
  cart_creation_pct: number;
  total_orders: number;
  total_sale_value: number;
  avg_aov: number;
  conversion_pct: number;
}

export type WalkinAnalysis = Record<'total' | 'new' | 'old' | 'no_walkin', WalkinRow>;

export interface PipelineCartRow {
  count: number;
  value: number;
  count_pct: number;
  value_pct: number;
}

export type PipelineCarts = Record<'total' | 'active' | 'warm' | 'cold' | 'dead', PipelineCartRow>;

export interface OrdersLostReason {
  key: string;
  label: string;
  count: number;
  value: number;
  count_pct: number;
  value_pct: number;
}

export interface OrdersLost {
  total: { count: number; value: number };
  reasons: OrdersLostReason[];
}

export interface CrmAdherence {
  follow_up_completion_pct: number;
  user_info_completion_pct: number;
  tat_hours: number;
  avg_weekday_walkin: { bm: number; store: number };
  avg_weekend_walkin: { bm: number; store: number };
}

export type ClosureStage = 'HOT' | 'WARM' | 'COLD' | 'DEAD';

export interface ClosureClient {
  client_name: string;
  phone: string;
  categories: string[];
  closure_date: string;
  cart_value: number;
  bm: string;
  store: string;
  stage: ClosureStage;
  last_followup: string;
}

export interface ClosurePipeline {
  total_value: number;
  clients: ClosureClient[];
}

export interface RankingRow {
  rank: number;
  bm_name: string;
  store: string;
  walkins: number;
  conv_pct: number;
  cart_pct: number;
  sale_value: number;
  fu_pct: number;
  is_selected: boolean;
}

export interface Rankings {
  company_wide: RankingRow[];
  within_store: RankingRow[];
}

export interface ReportCardMeta {
  bm_name: string;
  bm_contact: string;
  store: string;
  date_from: string;
  date_to: string;
  category: string;
  has_bm: boolean;
}

export interface ReportCardBMOption {
  name: string;
  contact: string;
}

export interface ReportCardData {
  meta: ReportCardMeta;
  walkin_analysis: WalkinAnalysis;
  pipeline_carts: PipelineCarts;
  orders_lost: OrdersLost;
  crm_adherence: CrmAdherence;
  closure_pipeline: ClosurePipeline;
  rankings: Rankings;
}

export interface ReportCardFilters {
  bm?: string;
  branch?: string[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  category?: string;
}

export async function fetchReportCard(filters: ReportCardFilters = {}): Promise<ReportCardData> {
  const params = new URLSearchParams();
  if (filters.bm) params.set('bm', filters.bm);
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category) params.set('category', filters.category);
  const qs = params.toString();
  return mdFetch(`/crm/report-card/${qs ? `?${qs}` : ''}`);
}

export async function fetchKylasDealInfo(dealId: number | string): Promise<KylasDealInfo | null> {
  try {
    const data = await kylasFetch(`/deals/${dealId}`);
    return {
      id: Number(dealId),
      name: data.name ?? `Deal #${dealId}`,
      ownerName: data.ownedBy?.name ?? null,
      stageName: data.pipelineStage?.name ?? null,
      pipelineName: data.pipeline?.name ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NPS / Feedback
// ---------------------------------------------------------------------------

export interface NPSRow {
  id: number;
  name: string;
  contact: number | null;
  store: string;
  bm: string;
  visit_date: string;
  time: string;
  status: 'submitted' | 'pending';
  feedback_id: number | null;
  score: number | null;
  understood: boolean | null;
  better: string[];
  remark: string;
}

export interface NPSCard { nps: number | null; responses: number }
export interface NPSOverview {
  today: NPSCard;
  yesterday: NPSCard;
  day_before: NPSCard;
  month: NPSCard;
  daily: { date: string; nps: number }[];
}

export interface NPSFilters { branches?: string[]; from?: string; to?: string; search?: string }

function npsParams(filters: NPSFilters): string {
  const params = new URLSearchParams();
  if (filters.branches?.length) params.set('branch', filters.branches.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchNPSTracker(filters: NPSFilters = {}): Promise<NPSRow[]> {
  return (await mdFetch(`/nps/tracker/${npsParams(filters)}`)) || [];
}

export async function fetchNPSOverview(filters: NPSFilters = {}): Promise<NPSOverview> {
  return await mdFetch(`/nps/overview/${npsParams(filters)}`);
}

export async function submitNPS(payload: {
  footfall_id: number;
  score: number | null;
  understood: boolean | null;
  better: string[];
  remark: string;
}): Promise<{ feedback_id: number }> {
  return await mdFetch('/nps/submit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
