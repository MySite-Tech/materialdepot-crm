import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Lead, Remark, Visit, CartItem, SupabaseRow, AppUser, Branch, ActivityLog } from '@/types/crm';

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are not set');
  }
  _client = createClient(url, key);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_t, prop) => {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const val = c[prop];
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(c) : val;
  },
});

function computeVisitDates(visits: Visit[]): { first_visit_date: string; latest_visit_date: string } {
  if (!visits || visits.length === 0) return { first_visit_date: '', latest_visit_date: '' };
  const sorted = [...visits].map(v => v.date).filter(Boolean).sort();
  return {
    first_visit_date: sorted[0] || '',
    latest_visit_date: sorted[sorted.length - 1] || '',
  };
}

export function toRow(lead: Lead): SupabaseRow {
  const vd = computeVisitDates(lead.visits || []);
  return {
    id: lead.id,
    created_at: lead.createdAt || '',
    client_name: lead.clientName || '',
    client_phone: lead.clientPhone || '',
    assigned_to: lead.assignedTo,
    branch: lead.branch,
    status: lead.status,
    lost_reason: lead.lostReason || '',
    cart_value: lead.cartValue || 0,
    cart_items: typeof lead.cartItems === 'string'
      ? lead.cartItems.split(',').map(s => s.trim()).filter(Boolean)
      : (lead.cartItems as CartItem[] || []),
    follow_up_date: lead.followUpDate || '',
    closure_date: lead.closureDate || '',
    remarks: lead.remarks || [],
    visits: lead.visits || [],
    first_visit_date: vd.first_visit_date,
    latest_visit_date: vd.latest_visit_date,
    client_type: lead.clientType || '',
    property_type: lead.propertyType || '',
    architect_involved: lead.architectInvolved || false,
    project_phase: lead.projectPhase || '',
  };
}

export function toLead(row: SupabaseRow): Lead {
  return {
    id: row.id,
    createdAt: row.created_at,
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    assignedTo: row.assigned_to,
    branch: row.branch,
    status: row.status,
    lostReason: row.lost_reason || '',
    cartValue: Number(row.cart_value) || 0,
    cartItems: Array.isArray(row.cart_items)
      ? row.cart_items.map(i => typeof i === 'string' ? i : (i as CartItem).name).join(', ')
      : (row.cart_items || ''),
    followUpDate: row.follow_up_date || '',
    closureDate: row.closure_date || '',
    remarks: row.remarks || [],
    visits: row.visits || [],
    clientType: row.client_type || '',
    propertyType: row.property_type || '',
    architectInvolved: row.architect_involved || false,
    projectPhase: row.project_phase || '',
  };
}

const compositeKey = (id: string, phone?: string) => `${id}|${phone || ''}`;

export async function fetchLeads(): Promise<Lead[]> {
  const allRows: SupabaseRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...(data as SupabaseRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const seenId = new Set<string>();
  const seenComposite = new Set<string>();
  const deduped = allRows.filter(row => {
    if (seenId.has(row.id)) return false;
    const key = compositeKey(row.id, row.client_phone);
    if (seenComposite.has(key)) return false;
    seenId.add(row.id);
    seenComposite.add(key);
    return true;
  });
  return deduped.map(toLead);
}

export async function fetchLeadRemarks(id: string): Promise<Remark[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('remarks')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as { remarks?: Remark[] } | null)?.remarks || [];
}

export async function fetchRemarksMap(): Promise<Record<string, Remark[]>> {
  const allRows: { id: string; client_phone: string; remarks: Remark[] }[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, client_phone, remarks')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...(data as { id: string; client_phone: string; remarks: Remark[] }[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const map: Record<string, Remark[]> = {};
  for (const row of allRows) {
    if (row.remarks?.length) map[`${row.id}|${row.client_phone || ''}`] = row.remarks;
  }
  return map;
}

export async function upsertLead(lead: Lead): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .upsert(toRow(lead), { onConflict: 'id,client_phone' });
  if (error) throw error;
}

export async function appendRemarkToLead(leadId: string, clientPhone: string | undefined, remark: Remark): Promise<Remark[]> {
  const { data, error: fetchErr } = await supabase
    .from('leads')
    .select('remarks')
    .eq('id', leadId)
    .eq('client_phone', clientPhone || '')
    .single();
  if (fetchErr) throw fetchErr;
  const remarks: Remark[] = [...((data as { remarks?: Remark[] }).remarks || []), remark];
  const { error: updateErr } = await supabase
    .from('leads')
    .update({ remarks })
    .eq('id', leadId)
    .eq('client_phone', clientPhone || '');
  if (updateErr) throw updateErr;
  return remarks;
}

export async function fetchLead(id: string, clientPhone?: string): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('client_phone', clientPhone || '')
    .single();
  if (error) throw error;
  return toLead(data as SupabaseRow);
}

function mergeRow(existing: SupabaseRow, incoming: SupabaseRow): SupabaseRow {
  const merged: SupabaseRow = { ...existing };
  const textFields: (keyof SupabaseRow)[] = ['client_name', 'client_phone', 'created_at', 'assigned_to', 'branch',
    'status', 'lost_reason', 'follow_up_date', 'closure_date',
    'client_type', 'property_type', 'project_phase', 'first_visit_date', 'latest_visit_date'];
  for (const f of textFields) {
    const val = incoming[f];
    if (val !== undefined && val !== null && val !== '' &&
        !(Array.isArray(val) && val.length === 0)) {
      (merged as unknown as Record<string, unknown>)[f] = val;
    }
  }
  if (incoming.cart_value && Number(incoming.cart_value) > 0) merged.cart_value = incoming.cart_value;
  if (incoming.architect_involved === true) merged.architect_involved = true;
  const existingRemarks: Remark[] = existing.remarks || [];
  const incomingRemarks: Remark[] = incoming.remarks || [];
  const allRemarks = [...existingRemarks];
  for (const r of incomingRemarks) {
    if (!allRemarks.some(er => er.ts === r.ts && er.text === r.text)) allRemarks.push(r);
  }
  merged.remarks = allRemarks;
  const existingVisits: Visit[] = existing.visits || [];
  const incomingVisits: Visit[] = incoming.visits || [];
  const allVisits = [...existingVisits];
  for (const v of incomingVisits) {
    if (!allVisits.some(ev => ev.date === v.date && ev.channel === v.channel)) allVisits.push(v);
  }
  merged.visits = allVisits;
  return merged;
}

export async function upsertLeads(leads: Lead[]): Promise<void> {
  const dedupMap = new Map<string, Lead>();
  leads.forEach(l => dedupMap.set(compositeKey(l.id, l.clientPhone), l));
  const deduped = [...dedupMap.values()];
  const incomingRows = deduped.map(toRow);

  const ids = incomingRows.map(r => r.id);
  const { data: existingData, error: fetchErr } = await supabase
    .from('leads')
    .select('*')
    .in('id', ids);
  if (fetchErr) throw fetchErr;

  const existingMap = new Map<string, SupabaseRow>(
    ((existingData || []) as SupabaseRow[]).map(r => [compositeKey(r.id, r.client_phone), r])
  );
  const mergedRows = incomingRows.map(row => {
    const key = compositeKey(row.id, row.client_phone);
    return existingMap.has(key) ? mergeRow(existingMap.get(key)!, row) : row;
  });

  for (let i = 0; i < mergedRows.length; i += 50) {
    const chunk = mergedRows.slice(i, i + 50);
    const { error } = await supabase
      .from('leads')
      .upsert(chunk, { onConflict: 'id,client_phone' });
    if (error) throw error;
  }
}

export async function deleteLead(id: string, clientPhone?: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('client_phone', clientPhone || '');
  if (error) throw error;
}

export async function loginWithCode(code: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('code', code)
    .single();
  if (error) return null;
  const row = data as Record<string, unknown>;
  return { ...(row as unknown as AppUser), allowedBranches: (row.allowed_branches as string[]) || [] };
}

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(u => ({
    ...(u as unknown as AppUser),
    allowedBranches: (u.allowed_branches as string[]) || [],
  }));
}

export async function updateUserBranches(userId: string | number, branches: string[]): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ allowed_branches: branches })
    .eq('id', userId);
  if (error && !(error as { message?: string }).message?.includes('allowed_branches')) throw error;
}

export async function addUser({ name, code, role }: { name: string; code: string; role: string }): Promise<AppUser> {
  const { data, error } = await supabase
    .from('users')
    .insert({ name, code, role: role || 'sales' })
    .select()
    .single();
  if (error) throw error;
  return data as AppUser;
}

export async function updateUser(id: string | number, updates: Partial<AppUser>): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteUser(id: string | number): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as Branch[];
}

export async function addBranch(name: string): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data as Branch;
}

export async function updateBranch(id: string | number, name: string): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBranch(id: string | number): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function logActivity({
  userId,
  userName,
  action,
  entityType,
  entityId,
  details,
}: {
  userId?: string | number | null;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('activity_logs')
    .insert({
      user_id: userId || null,
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || '',
    });
  if (error) throw error;
}

export async function fetchActivityLogs(limit = 200): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ActivityLog[];
}
