import { updateLeadProperties } from '../b2b/client-properties';
import { mdFetch } from '../core/client';

export async function fetchLeadRemarks(ticketId: number): Promise<import('../../../types/crm').Remark[]> {
  if (!ticketId) return [];
  try {
    const data = await mdFetch(`/crm/lead-remarks/?ticket_id=${ticketId}`);
    return (data || []) as import('../../../types/crm').Remark[];
  } catch {
    return [];
  }
}

export async function appendRemarkToLead(
  ticketId: number,
  remark: import('../../../types/crm').Remark,
  authorPhone?: string,
): Promise<import('../../../types/crm').Remark[]> {
  if (!ticketId) return [remark];
  await mdFetch('/crm/lead-remarks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, text: remark.text, author_phone: authorPhone || '' }),
  });
  return fetchLeadRemarks(ticketId);
}

export async function fetchLeadVisits(clientPhone: string): Promise<import('../../../types/crm').Visit[]> {
  if (!clientPhone) return [];
  try {
    const data = await mdFetch(`/crm/lead-visits/?client_phone=${clientPhone}`);
    return (data || []) as import('../../../types/crm').Visit[];
  } catch {
    return [];
  }
}

export async function upsertLead(lead: import('../../../types/crm').Lead): Promise<void> {
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

export async function upsertLeads(leads: import('../../../types/crm').Lead[]): Promise<void> {
  await Promise.all(leads.map(l => upsertLead(l).catch(() => {})));
}

export async function fetchLead(id: string, clientPhone?: string): Promise<import('../../../types/crm').Lead> {
  const phone = clientPhone || id;
  const data = await mdFetch(`/crm/leads/?q=${phone}&page_size=5`);
  const results: import('../../../types/crm').Lead[] = data?.results || [];
  const found = results.find(r => r.id === id || r.clientPhone === phone);
  if (!found) throw new Error(`Lead not found: ${id}`);
  return found;
}

export async function createLead(lead: import('../../../types/crm').Lead, bmPhone: string): Promise<void> {
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

