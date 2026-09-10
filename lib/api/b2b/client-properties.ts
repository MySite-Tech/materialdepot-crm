import { mdFetch } from '../core/client';

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
  lead_priority?: string;
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

