import { LeadData } from "../types/storeVisit";

const API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";
const KYLAS_API_URL = "https://api.kylas.io/v1";
const BEARER_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzc1NTc0NzQ4LCJpYXQiOjE3NzAzOTA3NDgsImp0aSI6IjNiMGFkMTUyMjdlNDQ2MGNhYzVmY2M0Njk5ZGNjZWY4IiwidXNlcl9pZCI6IjFlMDQxMWQ5LWE1YjEtNDViZC1iZDJkLTAyYzViYmNjMDk2MiJ9.YLUwIE9TxuHUizIZRuX3-4g2bGHFOF6KruJJaBH_wq0";
const KYLAS_API_KEY = "84ff1db2-99bf-4634-9e24-1930c1cfcd6a:20007";

// Shared fetch helpers
async function mdFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
  kylas_lead_owner_updated: boolean;
  kylas_message: string;
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
  remarks: never[];
}

export async function fetchCRMLeads(): Promise<CRMLeadRow[]> {
  const data = await mdFetch('/crm/leads/');
  return data.results || [];
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
