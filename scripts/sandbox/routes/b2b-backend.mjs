import { jsonOf, reply } from '../../stub/http.mjs';
import { SYNC_KEY } from '../constants.mjs';
import { istDay } from '../seed/time.mjs';

const ROW_KEYS = ['id', 'pipeline', 'stage', 'kylas_lead_id', 'owner', 'value', 'created_at', 'updated_at', 'meta_data'];

const flat = (r) => Object.fromEntries(ROW_KEYS.map((k) => [k, r[k] ?? null]));

const sameRow = (a, b) => a.pipeline === b.pipeline && (
  a.pipeline === 'inbound' && b.kylas_lead_id ? a.kylas_lead_id === String(b.kylas_lead_id) : a.id === String(b.id)
);

function upsert(db, input, onlyNew = false) {
  if (!input?.id || !input?.pipeline) return reply(422, { error: 'A row needs an id and a pipeline' });
  const now = new Date().toISOString();
  const i = db.rows.findIndex((r) => sameRow(r, input));
  if (i >= 0 && onlyNew) return null;
  const prev = i >= 0 ? db.rows[i] : null;
  const row = {
    id: String(input.id),
    pipeline: input.pipeline,
    stage: input.stage ?? '',
    kylas_lead_id: input.kylas_lead_id == null ? null : String(input.kylas_lead_id),
    owner: input.owner ?? '',
    value: Number(input.value) || 0,
    created_at: prev?.created_at ?? input.created_at ?? now,
    updated_at: now,
    meta_data: input.meta_data && typeof input.meta_data === 'object' ? input.meta_data : {},
  };
  if (prev) db.rows[i] = row; else db.rows.push(row);
  return row;
}

const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

function kamLoad(db) {
  const load = {};
  for (const r of db.rows) {
    if (r.pipeline !== 'client' || !r.owner) continue;
    load[r.owner] = (load[r.owner] ?? 0) + 1;
  }
  return load;
}

const MEMBER_KEYS = ['phone', 'name', 'team', 'kylas_user_id', 'kylas_name', 'in_rotation', 'active', 'is_admin', 'updated_at', 'updated_by'];

function putMember(db, body) {
  const phone = String(body?.phone ?? '').replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) return reply(422, { error: 'phone must be 10 digits' });
  const i = db.team.findIndex((m) => m.phone === phone && m.team === body.team);
  const row = Object.fromEntries(MEMBER_KEYS.map((k) => [k, body[k] ?? null]));
  row.phone = phone;
  row.is_admin = typeof body.is_admin === 'boolean' ? body.is_admin : i >= 0 && db.team[i].is_admin === true;
  row.updated_at = new Date().toISOString();
  if (i >= 0) db.team[i] = row; else db.team.push(row);
  if (typeof body.is_admin === 'boolean') for (const m of db.team) if (m.phone === phone) m.is_admin = body.is_admin;
  return row;
}

const EC_VISIT_KEYS = ['id', 'client_id', 'firm', 'contact_name', 'phone', 'branch', 'visit_date', 'visit_time', 'purpose',
  'status', 'bm_name', 'outcome', 'enq_id', 'scheduled_by', 'updated_by', 'source_team', 'lead_ref', 'note', 'assisted'];

function putEcVisit(db, body) {
  if (!body?.id || !body?.firm || !body?.branch || !body?.scheduled_by) return reply(400, { error: 'id, firm, branch and scheduled_by are required' });
  db.ecVisits ??= [];
  const i = db.ecVisits.findIndex((v) => v.id === body.id);
  const now = new Date().toISOString();
  const kind = body.kind || 'visit';
  if (kind === 'visit' && !body.visit_date) return reply(400, { error: 'visit_date is required on a visit' });
  const row = {
    ...Object.fromEntries(EC_VISIT_KEYS.map((k) => [k, body[k] ?? null])),
    kind, phones: body.phones ?? [], status: body.status || (kind === 'redirect' ? 'Directed' : 'Scheduled'),
    created_at: i >= 0 ? db.ecVisits[i].created_at : now, updated_at: now,
  };
  if (i >= 0) { row.scheduled_by = db.ecVisits[i].scheduled_by; db.ecVisits[i] = row; } else db.ecVisits.push(row);
  return row;
}

const STUDIO_STAFF = { '9000000021': 'Kavya (KAM)', '9000000099': 'Meera (B2B Manager)' };

function studioLogins(db) {
  const phones = db.rows.filter((r) => r.pipeline === 'client').flatMap((r) => (r.meta_data?.contacts ?? []).map((c) => String(c.number).replace(/\D/g, '').slice(-10)));
  return {
    logins: phones.slice(0, 4).map((phone, i) => ({
      phone, partner_id: `sandbox-${i}`, firm_name: 'Sandbox Studio', role: 'principal', visible_tabs: i % 2 ? ['rewards'] : null, power: i % 2 === 0,
    })),
    firms: [
      ...phones.slice(0, 4).map((phone, i) => ({ partner_id: `sandbox-${i}`, firm_name: 'Sandbox Studio', phones: [phone], gsts: [], logins: 1, power: i % 2 === 0, orders: i ? [] : [{ enq_id: 'ENQ-STUDIO-1', phone: '9000099998', source: 'team', value: 25000, ordered_on: '2026-10-20', status: 'Delivered' }], referrals: i ? [] : [{ name: 'Sandbox Referred Client', phone: '9000099997', status: 'approved', referred_on: '2026-10-01', orders: 0, value: 0 }] })),
      { partner_id: 'sandbox-mockup', firm_name: 'Mockup Interiors', phones: ['9000020001', '9000020010'], gsts: [], logins: 1, power: true, orders: [], referrals: [{ name: 'A client of Mockup Interiors', phone: '9000020009', status: 'approved', referred_on: istDay(-20), orders: 1, value: 215000 }] },
      { partner_id: 'sandbox-unmatched', firm_name: 'Sandbox Unmatched Studio', phones: ['9000099999'], gsts: [], logins: 3, power: true, orders: [], referrals: [] },
    ],
  };
}

function listEcVisits(db, query) {
  const clientId = query.get('client_id');
  const from = query.get('from');
  const to = query.get('to');
  const kind = query.get('kind');
  const visits = (db.ecVisits ?? [])
    .filter((v) => (!kind || (v.kind || 'visit') === kind) && (!clientId || v.client_id === clientId)
      && (!from || (v.visit_date && v.visit_date >= from)) && (!to || (v.visit_date && v.visit_date <= to)))
    .sort((a, b) => String(a.visit_date ?? '').localeCompare(String(b.visit_date ?? '')) || String(a.visit_time ?? '').localeCompare(String(b.visit_time ?? '')));
  return { visits };
}

function addAssignment(db, body) {
  if (!body?.lead_id || !body?.kind) return reply(422, { error: 'lead_id and kind are required' });
  const dup = body.kind === 'round_robin'
    && db.assignments.some((a) => a.kind === 'round_robin' && a.lead_id === String(body.lead_id));
  if (dup) return reply(409, { error: 'This lead already has a round-robin assignment' });
  const row = { ...body, lead_id: String(body.lead_id), id: db.nextAssignmentId++, at: new Date().toISOString() };
  db.assignments.push(row);
  return { id: row.id };
}

function lastRoundRobin(db) {
  const last = db.assignments
    .filter((a) => a.kind === 'round_robin')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.id - a.id)[0];
  return { to_kylas_id: last ? Number(last.to_kylas_id) : null };
}

export function backendRoutes(db) {
  return (req) => {
    if (req.path === '/auth/handoff') {
      const phone = db.handoffs?.[req.query.get('code')];
      if (!phone) return reply(401, { sandbox: 'Studio Space would show its sign-in page: unknown or spent code' });
      delete db.handoffs[req.query.get('code')];
      return { sandbox: 'Studio Space would set its session cookies and open /console', signedInAs: STUDIO_STAFF[phone] };
    }
    if (req.headers['x-sync-key'] !== SYNC_KEY) return reply(403, { error: 'x-sync-key does not match the sandbox key' });
    const path = req.path.replace(/^\/b2b/, '').replace(/\/+$/, '');
    const body = jsonOf(req.raw);
    const { method, query } = req;
    const id = (p) => decodeURIComponent(path.slice(p.length));

    if (path === '/rows' && method === 'GET') return [...db.rows].sort(byNewest).map(flat);
    if (path === '/rows' && method === 'POST') return upsert(db, body);
    if (path === '/rows/bulk' && method === 'POST') {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const out = rows.map((r) => upsert(db, r, !!body.only_new));
      const bad = out.find((r) => r && r.status);
      return bad ?? { written: out.filter(Boolean).length, skipped: out.filter((r) => !r).length };
    }
    if (path.startsWith('/rows/') && method === 'DELETE') {
      const before = db.rows.length;
      db.rows = db.rows.filter((r) => !(r.id === id('/rows/') && r.pipeline === (query.get('pipeline') || r.pipeline)));
      return { deleted: before - db.rows.length };
    }
    if (path === '/kam-load') return kamLoad(db);
    if (path === '/waitlist') return { signups: db.waitlist ?? [] };
    if (path === '/studio-access') return studioLogins(db);
    if (path === '/studio-number' && method === 'POST') return { phone: body?.phone, partner_id: body?.partner_id };
    if (path === '/staff-handoff' && method === 'POST') {
      if (!STUDIO_STAFF[body?.phone]) return reply(404, { error: 'No active Studio Space team login has this mobile' });
      const code = `sandbox-${Object.keys(db.handoffs ??= {}).length + 1}-${body.phone}`;
      db.handoffs[code] = body.phone;
      return { code, expires_in: 60 };
    }
    if (path === '/target' && method === 'GET') return db.target;
    if (path === '/target' && method === 'POST') { db.target = { ...body, updated_at: new Date().toISOString() }; return db.target; }

    if (path === '/team' && method === 'GET') {
      return { members: [...db.team].sort((a, b) => a.name.localeCompare(b.name) || a.phone.localeCompare(b.phone)) };
    }
    if (path === '/team' && method === 'PUT') return putMember(db, body);
    if (path === '/ec-visits' && method === 'GET') return listEcVisits(db, query);
    if (path === '/ec-visits' && method === 'PUT') return putEcVisit(db, body);
    if (path === '/assignments/last-round-robin') return lastRoundRobin(db);
    if (path === '/assignments/lead-ids') {
      const since = query.get('since') || '';
      return { lead_ids: [...new Set(db.assignments.filter((a) => String(a.lead_created_at ?? '') >= since).map((a) => a.lead_id))] };
    }
    if (path === '/assignments' && method === 'POST') return addAssignment(db, body);
    if (path.startsWith('/assignments/') && method === 'DELETE') {
      const before = db.assignments.length;
      db.assignments = db.assignments.filter((a) => String(a.id) !== id('/assignments/'));
      return { deleted: before - db.assignments.length };
    }
    if (path === '/inbound/worked' && method === 'POST') {
      const want = new Set((body?.ids ?? []).map(String));
      return { ids: db.rows.filter((r) => r.pipeline === 'inbound' && r.stage !== 'New' && want.has(r.kylas_lead_id)).map((r) => r.kylas_lead_id) };
    }
    return reply(404, { error: `The sandbox B2B backend has no ${method} ${path}` });
  };
}
