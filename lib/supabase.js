import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Convert app lead object to Supabase row (camelCase → snake_case)
function computeVisitDates(visits) {
  if (!visits || visits.length === 0) return { first_visit_date: '', latest_visit_date: '' };
  const sorted = [...visits].map(v => v.date).filter(Boolean).sort();
  return {
    first_visit_date: sorted[0] || '',
    latest_visit_date: sorted[sorted.length - 1] || '',
  };
}

export function toRow(lead) {
  const vd = computeVisitDates(lead.visits);
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
    cart_items: typeof lead.cartItems === 'string' ? lead.cartItems.split(',').map(s => s.trim()).filter(Boolean) : (lead.cartItems || []),
    follow_up_date: lead.followUpDate || '',
    closure_date: lead.closureDate || '',
    remarks: lead.remarks || [],
    visits: lead.visits || [],
    first_visit_date: vd.first_visit_date,
    latest_visit_date: vd.latest_visit_date,
    client_type: lead.clientType || '',
    property_type: lead.propertyType || '',
    architect_involved: lead.architectInvolved || false,
  };
}

// Convert Supabase row to app lead object (snake_case → camelCase)
export function toLead(row) {
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
    cartItems: Array.isArray(row.cart_items) ? row.cart_items.map(i => typeof i === 'string' ? i : i.name).join(', ') : (row.cart_items || ''),
    followUpDate: row.follow_up_date || '',
    closureDate: row.closure_date || '',
    remarks: row.remarks || [],
    visits: row.visits || [],
    clientType: row.client_type || '',
    propertyType: row.property_type || '',
    architectInvolved: row.architect_involved || false,
  };
}

// Composite key helper — (id, client_phone) uniquely identifies a lead
const compositeKey = (id, phone) => `${id}|${phone || ''}`;

export async function fetchLeads() {
  const allRows = [];
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
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  // Deduplicate by (id + client_phone) — keep latest (first since sorted desc by created_at)
  const seen = new Set();
  const deduped = allRows.filter(row => {
    const key = compositeKey(row.id, row.client_phone);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.map(toLead);
}

export async function upsertLead(lead) {
  const { error } = await supabase
    .from('leads')
    .upsert(toRow(lead), { onConflict: 'id,client_phone' });
  if (error) throw error;
}

// Fetch latest lead, append remark, save — safe for concurrent users
// Requires both id and clientPhone to target the exact row
export async function appendRemarkToLead(leadId, clientPhone, remark) {
  const { data, error: fetchErr } = await supabase
    .from('leads')
    .select('remarks')
    .eq('id', leadId)
    .eq('client_phone', clientPhone || '')
    .single();
  if (fetchErr) throw fetchErr;
  const remarks = [...(data.remarks || []), remark];
  const { error: updateErr } = await supabase
    .from('leads')
    .update({ remarks })
    .eq('id', leadId)
    .eq('client_phone', clientPhone || '');
  if (updateErr) throw updateErr;
  return remarks;
}

// Fetch a single lead by (id, clientPhone)
export async function fetchLead(id, clientPhone) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('client_phone', clientPhone || '')
    .single();
  if (error) throw error;
  return toLead(data);
}

// Smart merge at the row level: only overwrite DB fields if the incoming value is non-empty
function mergeRow(existing, incoming) {
  const merged = { ...existing };
  const textFields = ['client_name', 'client_phone', 'created_at', 'assigned_to', 'branch',
    'status', 'lost_reason', 'cart_items', 'follow_up_date', 'closure_date',
    'client_type', 'property_type', 'first_visit_date', 'latest_visit_date'];
  for (const f of textFields) {
    const val = incoming[f];
    if (val !== undefined && val !== null && val !== '' &&
        !(Array.isArray(val) && val.length === 0)) {
      merged[f] = val;
    }
  }
  // Cart value: only update if incoming is non-zero
  if (incoming.cart_value && Number(incoming.cart_value) > 0) merged.cart_value = incoming.cart_value;
  // Architect involved: only update if explicitly true
  if (incoming.architect_involved === true) merged.architect_involved = true;
  // Remarks: append, never remove — deduplicate by ts+text
  const existingRemarks = existing.remarks || [];
  const incomingRemarks = incoming.remarks || [];
  const allRemarks = [...existingRemarks];
  for (const r of incomingRemarks) {
    if (!allRemarks.some(er => er.ts === r.ts && er.text === r.text)) allRemarks.push(r);
  }
  merged.remarks = allRemarks;
  // Visits: append, deduplicate by date+channel
  const existingVisits = existing.visits || [];
  const incomingVisits = incoming.visits || [];
  const allVisits = [...existingVisits];
  for (const v of incomingVisits) {
    if (!allVisits.some(ev => ev.date === v.date && ev.channel === v.channel)) allVisits.push(v);
  }
  merged.visits = allVisits;
  return merged;
}

export async function upsertLeads(leads) {
  // Deduplicate incoming list by (id + client_phone) — keep last occurrence
  const dedupMap = new Map();
  leads.forEach(l => dedupMap.set(compositeKey(l.id, l.clientPhone), l));
  const deduped = [...dedupMap.values()];
  const incomingRows = deduped.map(toRow);

  // Fetch existing rows from DB matching these (id, client_phone) pairs
  const ids = incomingRows.map(r => r.id);
  const { data: existingData, error: fetchErr } = await supabase
    .from('leads')
    .select('*')
    .in('id', ids);
  if (fetchErr) throw fetchErr;

  // Build lookup by composite key
  const existingMap = new Map((existingData || []).map(r => [compositeKey(r.id, r.client_phone), r]));
  const mergedRows = incomingRows.map(row => {
    const key = compositeKey(row.id, row.client_phone);
    return existingMap.has(key) ? mergeRow(existingMap.get(key), row) : row;
  });

  // Batch upsert in chunks of 50
  for (let i = 0; i < mergedRows.length; i += 50) {
    const chunk = mergedRows.slice(i, i + 50);
    const { error } = await supabase
      .from('leads')
      .upsert(chunk, { onConflict: 'id,client_phone' });
    if (error) throw error;
  }
}

export async function deleteLead(id, clientPhone) {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('client_phone', clientPhone || '');
  if (error) throw error;
}

export async function loginWithCode(code) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('code', code)
    .single();
  if (error) return null;
  return { ...data, allowedBranches: data.allowed_branches || [] };
}

// ── User management (admin) ────────────────────────────────────────────────

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(u => ({ ...u, allowedBranches: u.allowed_branches || [] }));
}

export async function updateUserBranches(userId, branches) {
  const { error } = await supabase
    .from('users')
    .update({ allowed_branches: branches })
    .eq('id', userId);
  if (error) throw error;
}

export async function addUser({ name, code, role }) {
  const { data, error } = await supabase
    .from('users')
    .insert({ name, code, role: role || 'sales' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUser(id, updates) {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteUser(id) {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Branch management (admin) ──────────────────────────────────────────────

export async function fetchBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addBranch(name) {
  const { data, error } = await supabase
    .from('branches')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBranch(id, name) {
  const { error } = await supabase
    .from('branches')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBranch(id) {
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Activity Logs ─────────────────────────────────────────────────────────

export async function logActivity({ userId, userName, action, entityType, entityId, details }) {
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

export async function fetchActivityLogs(limit = 200) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
