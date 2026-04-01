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

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toLead);
}

export async function upsertLead(lead) {
  const { error } = await supabase
    .from('leads')
    .upsert(toRow(lead), { onConflict: 'id' });
  if (error) throw error;
}

export async function upsertLeads(leads) {
  const rows = leads.map(toRow);
  const { error } = await supabase
    .from('leads')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteLead(id) {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function loginWithCode(code) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, code, role')
    .eq('code', code)
    .single();
  if (error) return null;
  return data;
}

// ── User management (admin) ────────────────────────────────────────────────

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
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
