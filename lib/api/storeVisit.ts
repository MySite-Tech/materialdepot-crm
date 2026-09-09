import { mdFetch } from './client';
import { kylasFetch } from './kylasClient';

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

