import { LeadData } from "../types/storeVisit";

const API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";
const KYLAS_API_URL = "https://api.kylas.io/v1";
const BEARER_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzc1NTc0NzQ4LCJpYXQiOjE3NzAzOTA3NDgsImp0aSI6IjNiMGFkMTUyMjdlNDQ2MGNhYzVmY2M0Njk5ZGNjZWY4IiwidXNlcl9pZCI6IjFlMDQxMWQ5LWE1YjEtNDViZC1iZDJkLTAyYzViYmNjMDk2MiJ9.YLUwIE9TxuHUizIZRuX3-4g2bGHFOF6KruJJaBH_wq0";
const KYLAS_API_KEY = "84ff1db2-99bf-4634-9e24-1930c1cfcd6a:20007";

const TOKEN_KEY = 'md_crm_token';

export function getToken(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || '';
}

function saveToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// Shared fetch helpers
async function mdFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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

export interface LookupResponse {
  success: boolean;
  leadId: number;
  leadData: LeadData;
  fullLeadBody?: Record<string, unknown>;
}

export interface UpdateResponse {
  success: boolean;
  leadId: number;
  conversionDetails?: Array<{ entityType: string; entityId: number }>;
}

export async function lookupLeadByPhone(phoneNumber: string, branch: string): Promise<LookupResponse> {
  const data = await mdFetch("/store-visit-lead/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact: phoneNumber, branch: branch.toUpperCase() }),
  });
  return {
    success: true,
    leadId: data.id,
    leadData: { id: data.id, customFieldValues: data.customFieldValues || {}, conversionDetails: data.conversionDetails },
    fullLeadBody: data,
  };
}

export async function updateLead(
  leadId: number,
  fullLeadBody: Record<string, unknown>,
  customFieldValues: Record<string, unknown>,
  contact: string,
  name?: string,
): Promise<UpdateResponse> {
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

export function getKylasRedirectUrl(leadId: number, contactId?: number): string {
  return contactId
    ? `https://app.kylas.io/sales/contacts/details/${contactId}`
    : `https://app.kylas.io/sales/leads/details/${leadId}`;
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
  cartValueGt?: number;
  ownerUserOrgId?: string | number;
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
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
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
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
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
  availableBMs: string[];
  summary: DashboardSummary;
}

export interface DashboardFilters {
  branch?: string[];
  bm?: string[];
  closureFrom?: string;
  closureTo?: string;
  createdFrom?: string;
  createdTo?: string;
}

export async function markLeadLost(cartNumber: string, lostReason: string): Promise<void> {
  await mdFetch('/crm/lead-status/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart_number: cartNumber, lost_reason: lostReason }),
  });
}

export async function fetchDashboardData(filters: DashboardFilters = {}): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.closureFrom) params.set('closure_from', filters.closureFrom);
  if (filters.closureTo) params.set('closure_to', filters.closureTo);
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
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
): Promise<void> {
  if (!contact) return;
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null)
  );
  if (!Object.keys(payload).length) return;
  await mdFetch("/store-visit/client-properties/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact, ...payload }),
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
  const res = await fetch(`${API_BASE_URL}/user-organisation/${id}/`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`API error: ${res.status}`);
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
  const res = await fetch(`${API_BASE_URL}/orgainsation-branch/${id}/`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`API error: ${res.status}`);
}

// ---------------------------------------------------------------------------
// CRM Lead Remarks — replaces Supabase remarks in leads table
// ---------------------------------------------------------------------------

export async function fetchLeadRemarks(clientPhone: string): Promise<import('../types/crm').Remark[]> {
  if (!clientPhone) return [];
  try {
    const data = await mdFetch(`/crm/lead-remarks/?client_phone=${clientPhone}`);
    return (data || []) as import('../types/crm').Remark[];
  } catch {
    return [];
  }
}

export async function appendRemarkToLead(
  _leadId: string,
  clientPhone: string | undefined,
  remark: import('../types/crm').Remark,
  authorPhone?: string,
): Promise<import('../types/crm').Remark[]> {
  if (!clientPhone) return [remark];
  await mdFetch('/crm/lead-remarks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_phone: clientPhone, text: remark.text, author_phone: authorPhone || '' }),
  });
  return fetchLeadRemarks(clientPhone);
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
  });
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
