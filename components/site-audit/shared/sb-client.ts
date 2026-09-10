import { ensureAuditOrderOwner } from './staff/audit-owner';
import { sanitizeWriteBody } from './write-sanitize';

export const SB_URL = 'https://jqrdfnjfxqxrazfkaofm.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcmRmbmpmeHF4cmF6Zmthb2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTU5NTcsImV4cCI6MjA5NjY3MTk1N30.2mvCPc0E_vDn2WaID5sEjwU4Dyj53rhevGrSPBa3__g';
export const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

const CACHE_TTL_MS = 8000;
const cache = new Map<string, { ts: number; promise: Promise<any> }>();

if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.ts >= CACHE_TTL_MS) cache.delete(key);
    }
  }, CACHE_TTL_MS * 2);
}

async function cachedFetch(url: string, signal: AbortSignal): Promise<any> {
  try {
    const r = await fetch(url, { headers: H, signal });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`[siteAudit] ${r.status} ${r.statusText} for ${url}${body ? ' — ' + body.slice(0, 300) : ''}`);
      return null;
    }
    return await r.json();
  } catch (e) {

    console.error(`[siteAudit] fetch failed for ${url}`, e);
    return null;
  }
}

function invalidateTable(t: string): void {
  const base = t.endsWith('_slim') ? t.slice(0, -'_slim'.length) : t;
  const variants = [base, base + '_slim'];
  for (const key of cache.keys()) {
    if (variants.some((v) => key === v || key.startsWith(v + '?'))) cache.delete(key);
  }
}

function withCache(q: string, timeoutMs: number): Promise<any> {
  const now = Date.now();
  const hit = cache.get(q);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.promise;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  const promise = cachedFetch(SB_URL + '/rest/v1/' + q, ctrl.signal).finally(() => clearTimeout(tid));
  cache.set(q, { ts: now, promise });

  promise.then((result) => { if (result == null) cache.delete(q); }, () => cache.delete(q));
  return promise;
}

export async function sbGet(q: string): Promise<any> {
  return withCache(q, 12000);
}

export async function sbGetLong(q: string): Promise<any> {
  return withCache(q, 45000);
}

export async function sbGetPaged(q: string, pageSize = 50, maxPages = 200): Promise<any[] | null> {
  const sep = q.includes('?') ? '&' : '?';
  const out: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await sbGetLong(`${q}${sep}order=id&limit=${pageSize}&offset=${page * pageSize}`);
    if (!Array.isArray(rows)) return null;
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  return out;
}

export async function sbPost(t: string, b: any): Promise<any> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const payload = t === 'audit_orders' ? await ensureAuditOrderOwner(b) : b;
    const r = await fetch(SB_URL + '/rest/v1/' + t, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(await sanitizeWriteBody(payload)), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    const j = await r.json();
    invalidateTable(t);
    return j;
  } finally {
    clearTimeout(tid);
  }
}

export async function sbPatch(t: string, id: string, b: any): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(await sanitizeWriteBody(b)), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}

export async function loadSetting(key: string): Promise<{ id: string | null; value: any }> {
  try {
    const r = await sbGet('app_settings?key=eq.' + encodeURIComponent(key) + '&select=id,value');
    if (Array.isArray(r) && r.length) return { id: r[0].id, value: r[0].value || {} };
  } catch {
    /* table may not exist yet — treat as unset */
  }
  return { id: null, value: {} };
}
export async function saveSetting(key: string, value: any, knownId: string | null): Promise<string | null> {
  if (knownId) {
    await sbPatch('app_settings', knownId, { value, updated_at: new Date().toISOString() });
    return knownId;
  }
  const ex = await sbGet('app_settings?key=eq.' + encodeURIComponent(key) + '&select=id').catch(() => null);
  if (Array.isArray(ex) && ex.length) {
    await sbPatch('app_settings', ex[0].id, { value, updated_at: new Date().toISOString() });
    return ex[0].id;
  }
  const c = await sbPost('app_settings', { key, value });
  return Array.isArray(c) && c[0] ? c[0].id : null;
}

export async function publishSlotConfig(key: string, slots: Array<{ id: string; label: string }>) {
  try {
    await saveSetting('slots.' + key, { slots }, null);
  } catch {
    /* sharing is an enhancement — the local config already saved */
  }
}
export async function fetchSharedSlotLabels(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const got = await Promise.all(keys.map((k) => loadSetting('slots.' + k).catch(() => ({ value: null }))));
  for (const g of got) {
    const list = g && g.value && Array.isArray(g.value.slots) ? g.value.slots : null;
    if (list) for (const s of list) if (s && s.id && s.label) out[s.id] = s.label;
  }
  return out;
}

export async function sbPatchWhere(t: string, filter: string, b: any): Promise<number> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?' + filter, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(await sanitizeWriteBody(b)),
      signal: ac.signal,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    const j = await r.json().catch(() => []);
    invalidateTable(t);
    return Array.isArray(j) ? j.length : 0;
  } finally {
    clearTimeout(tid);
  }
}

export async function sbPatchLong(t: string, id: string, b: any): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 90000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(await sanitizeWriteBody(b)), signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}

export async function sbDel(t: string, id: string): Promise<void> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(SB_URL + '/rest/v1/' + t + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: H, signal: ac.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'DB error ' + r.status);
    }
    invalidateTable(t);
  } finally {
    clearTimeout(tid);
  }
}
