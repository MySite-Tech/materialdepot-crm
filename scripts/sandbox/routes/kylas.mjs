import { jsonOf, reply } from '../../stub/http.mjs';
import { KYLAS_API_USER, KYLAS_USERS } from '../constants.mjs';

const stageOf = (l) => (typeof l.pipelineStage === 'object' ? l.pipelineStage?.id : l.pipelineStage);

const FIELD = {
  ownerId: (l) => l.ownerId,
  pipeline: (l) => l.pipeline?.id,
  pipelineStage: stageOf,
  createdAt: (l) => Date.parse(l.createdAt),
  updatedAt: (l) => Date.parse(l.updatedAt),
};

const digits = (v) => String(v ?? '').replace(/\D/g, '');

function textHit(l, q) {
  const want = String(q).trim().toLowerCase();
  if (!want) return true;
  const hay = [l.firstName, l.lastName, l.requirementName, ...(l.phoneNumbers ?? []).map((p) => p.value)]
    .map((v) => String(v ?? '').toLowerCase());
  return hay.some((h) => h.includes(want)) || (digits(want).length >= 4 && hay.some((h) => digits(h).includes(digits(want))));
}

function ruleHit(l, rule) {
  if (Array.isArray(rule.rules)) return groupHit(l, rule);
  if (rule.field === 'multi_field') return textHit(l, rule.value);
  const read = FIELD[rule.field];
  if (!read) return true;
  const v = read(l);
  const isDate = rule.type === 'date';
  const val = (x) => (isDate ? Date.parse(x) : Number(x));
  switch (rule.operator) {
    case 'equal': return v === val(rule.value);
    case 'not_equal': return v !== val(rule.value);
    case 'in': return (rule.value ?? []).map(val).includes(v);
    case 'not_in': return !(rule.value ?? []).map(val).includes(v);
    case 'greater': return v > val(rule.value);
    case 'less': return v < val(rule.value);
    case 'between': return v >= val(rule.value[0]) && v <= val(rule.value[1]);
    default: return true;
  }
}

function groupHit(l, group) {
  const rules = group?.rules ?? [];
  return String(group?.condition).toUpperCase() === 'OR' ? rules.some((r) => ruleHit(l, r)) : rules.every((r) => ruleHit(l, r));
}

function page(items, query, oneBased = false) {
  const size = Math.max(1, Number(query.get('size')) || 25);
  const raw = Number(query.get('page')) || 0;
  const n = oneBased ? Math.max(0, raw - 1) : raw;
  const totalElements = items.length;
  return {
    content: items.slice(n * size, n * size + size), totalElements, totalPages: Math.ceil(totalElements / size),
    number: raw, size, first: n === 0, last: (n + 1) * size >= totalElements,
  };
}

function sortBy(items, query) {
  const [field = 'createdAt', dir = 'desc'] = String(query.get('sort') || '').split(',');
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => sign * String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
}

function patchLead(lead, ops) {
  for (const op of Array.isArray(ops) ? ops : []) {
    const keys = String(op.path || '').split('/').filter(Boolean).map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!keys.length) continue;
    let target = lead;
    for (const k of keys.slice(0, -1)) target = target[k] ??= {};
    const last = keys.at(-1);
    if (op.op === 'remove') delete target[last]; else target[last] = op.value;
  }
  lead.updatedAt = new Date().toISOString();
  return lead;
}

function multipart(req) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(req.headers['content-type'] || '');
  if (!boundary) return {};
  const out = {};
  for (const part of req.raw.toString('utf8').split(`--${boundary[1] || boundary[2]}`)) {
    const at = part.indexOf('\r\n\r\n');
    const name = /name="([^"]+)"/.exec(part.slice(0, at));
    if (at < 0 || !name) continue;
    out[name[1]] = part.slice(at + 4).replace(/\r\n$/, '');
  }
  return out;
}

const userRow = (u) => {
  const [firstName, ...rest] = u.name.split(' ');
  return {
    id: u.id, name: u.name, firstName, lastName: rest.join(' '), active: u.active, email: `user${u.id}@sandbox.invalid`,
    phoneNumbers: [{ type: 'MOBILE', code: 'IN', dialCode: '+91', value: u.phone, primary: true }],
  };
};

export function kylasRoutes(db) {
  const leadById = (id) => db.leads.find((l) => String(l.id) === String(id));
  const relatedLead = (c) => (Array.isArray(c.relatedTo) ? c.relatedTo : [c.relatedTo]).find((r) => r?.entity === 'lead')?.id;

  return (req) => {
    const { method, query } = req;
    const path = req.path.replace(/\/+$/, '') || '/';
    const body = jsonOf(req.raw);

    if (path === '/search/lead' && method === 'POST') {
      return page(sortBy(db.leads.filter((l) => groupHit(l, body?.jsonRule)), query), query);
    }
    const leadPath = /^\/leads\/(\d+)$/.exec(path);
    if (leadPath) {
      const lead = leadById(leadPath[1]);
      if (!lead) return reply(404, { errorCode: '01601005', message: 'Lead not found' });
      return method === 'PATCH' ? patchLead(lead, body) : lead;
    }
    if (path === '/users') return page(KYLAS_USERS.map(userRow), query);

    if (path === '/notes/relation' && method === 'GET') {
      const id = query.get('targetEntityId');
      return page(sortBy(db.notes.filter((n) => n.targetEntityId === id), query), query);
    }
    if (path === '/notes/relation' && method === 'POST') {
      const note = {
        id: db.nextId++, targetEntityId: String(body?.targetEntityId ?? ''), targetEntityType: body?.targetEntityType ?? 'LEAD',
        description: body?.sourceEntity?.description ?? '', createdAt: new Date().toISOString(), createdBy: { id: 0, name: KYLAS_API_USER },
      };
      db.notes.push(note);
      return note;
    }

    if (path === '/call-logs/search' && method === 'POST') {
      const rule = (body?.jsonRule?.rules ?? []).find((r) => r.field === 'related_to');
      const want = String(rule?.value?.id ?? '');
      return page(sortBy(db.callLogs.filter((c) => !want || String(relatedLead(c)) === want), query), query, true);
    }
    const callPath = /^\/call-logs\/(\d+)$/.exec(path);
    if (callPath) return db.callLogs.find((c) => String(c.id) === callPath[1]) ?? reply(404, { message: 'Call log not found' });
    if (path === '/call-logs' && method === 'POST') {
      const f = multipart(req);
      const minutes = Number(f.duration);
      const call = {
        id: db.nextId++, createdAt: f.startTime || new Date().toISOString(), callType: f.callType || 'outgoing',
        outcome: f.outcome || '', duration: f.durationType === 'minutes' && minutes ? minutes * 60 : Number(f.duration) || 0,
        callSummary: f.callSummary || '', notes: '', phoneId: Number(f.phoneId) || null,
        relatedTo: [{ id: Number(f['relatedTo[id]']), entity: f['relatedTo[entity]'] || 'lead', name: f['relatedTo[name]'] || '' }],
        createdBy: { id: 0, name: KYLAS_API_USER },
      };
      db.callLogs.push(call);
      return { id: call.id };
    }
    return { content: [], totalElements: 0, totalPages: 0 };
  };
}
