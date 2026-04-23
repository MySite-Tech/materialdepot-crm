import { LeadData } from "../types/storeVisit";

const API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";
const KYLAS_API_URL = "https://api.kylas.io/v1";
const BEARER_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzc1NTc0NzQ4LCJpYXQiOjE3NzAzOTA3NDgsImp0aSI6IjNiMGFkMTUyMjdlNDQ2MGNhYzVmY2M0Njk5ZGNjZWY4IiwidXNlcl9pZCI6IjFlMDQxMWQ5LWE1YjEtNDViZC1iZDJkLTAyYzViYmNjMDk2MiJ9.YLUwIE9TxuHUizIZRuX3-4g2bGHFOF6KruJJaBH_wq0";
const KYLAS_API_KEY = "84ff1db2-99bf-4634-9e24-1930c1cfcd6a:20007";

export interface Branch {
  id: number;
  name: string;
  displayName: string;
}

export async function fetchBranches(): Promise<Branch[]> {
  console.log(`[API] Fetching branches`);

  const response = await fetch(`${KYLAS_API_URL}/fields/2215123`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "api-key": KYLAS_API_KEY,
    },
  });

  if (!response.ok) {
    console.error(`[API] Fetch branches error: ${response.status} ${response.statusText}`);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const values = data.field?.picklist?.values || [];

  return values
    .filter((v: { deleted: boolean; disabled: boolean }) => !v.deleted && !v.disabled)
    .map((v: { id: number; name: string; displayName: string }) => ({
      id: v.id,
      name: v.name,
      displayName: v.displayName,
    }));
}

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
  const branchName = branch.toUpperCase();

  console.log(`[API] Looking up lead for phone: ${phoneNumber}, branch: ${branchName}`);

  const response = await fetch(`${API_BASE_URL}/store-visit-lead/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      contact: phoneNumber,
      branch: branchName,
    }),
  });

  if (!response.ok) {
    console.error(`[API] Error: ${response.status} ${response.statusText}`);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[API] Response:`, data);

  return {
    success: true,
    leadId: data.id,
    leadData: {
      id: data.id,
      customFieldValues: data.customFieldValues || {},
      conversionDetails: data.conversionDetails,
    },
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
  console.log(`[API] Updating lead ${leadId} with customFieldValues:`, customFieldValues);

  // Always set firstName to the name from form (or contact if no name provided)
  const newFirstName = name?.trim() || contact;
  // Set lastName to contact (phone number)
  const newLastName = contact;

  console.log(
    `[API] Name update debug - contact: "${contact}", name: "${name}", newFirstName: "${newFirstName}", newLastName: "${newLastName}"`,
  );

  const updatedBody = {
    ...fullLeadBody,
    firstName: newFirstName,
    lastName: newLastName,
    customFieldValues: {
      ...((fullLeadBody.customFieldValues as Record<string, unknown>) || {}),
      ...customFieldValues,
    },
  };

  const response = await fetch(`${KYLAS_API_URL}/leads/${leadId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "api-key": KYLAS_API_KEY,
    },
    body: JSON.stringify(updatedBody),
  });

  if (!response.ok) {
    console.error(`[API] Update error: ${response.status} ${response.statusText}`);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[API] Update response:`, data);

  return {
    success: true,
    leadId: data.id,
    conversionDetails: data.conversionDetails,
  };
}

export async function fetchLeadById(
  leadId: number,
): Promise<{
  fullLeadBody: Record<string, unknown>;
  conversionDetails?: Array<{ entityType: string; entityId: number }>;
}> {
  console.log(`[API] Fetching lead ${leadId}`);

  const response = await fetch(`${KYLAS_API_URL}/leads/${leadId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "api-key": KYLAS_API_KEY,
    },
  });

  if (!response.ok) {
    console.error(`[API] Fetch error: ${response.status} ${response.statusText}`);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[API] Fetch response:`, data);

  return {
    fullLeadBody: data,
    conversionDetails: data.conversionDetails,
  };
}

export async function searchContactByPhone(phoneNumber: string): Promise<number | null> {
  console.log(`[API] Searching contact by phone: ${phoneNumber}`);

  const response = await fetch(`${KYLAS_API_URL}/search/global-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": KYLAS_API_KEY,
    },
    body: JSON.stringify({
      query: phoneNumber,
      entities: ["CONTACT"],
    }),
  });

  if (!response.ok) {
    console.error(`[API] Search error: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  console.log(`[API] Search response:`, data);

  // Find first CONTACT entity and get the first value's id
  const contactEntity = data.content?.find((item: { entityType: string }) => item.entityType === "CONTACT");
  if (contactEntity?.values?.length > 0) {
    const contactId = contactEntity.values[0].id;
    console.log(`[API] Found contact via search: ${contactId}`);
    return contactId;
  }

  console.log(`[API] No contact found via search`);
  return null;
}

export function getKylasRedirectUrl(leadId: number, contactId?: number): string {
  if (contactId) {
    return `https://app.kylas.io/sales/contacts/details/${contactId}`;
  }
  return `https://app.kylas.io/sales/leads/details/${leadId}`;
}
