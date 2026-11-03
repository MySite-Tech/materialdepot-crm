#!/usr/bin/env node
// node scripts/inbound-owner-cutover.mjs --backend <url> --secret <x-sync-key> --log <assignments.json> [--apply]
import { readFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const backend = (arg('backend') || '').replace(/\/+$/, '');
const secret = arg('secret');
const logPath = arg('log');
const apply = process.argv.includes('--apply');
const kylasKey = process.env.KYLAS_API_KEY;
if (!backend || !secret || !logPath || !kylasKey) {
  console.error('Needs --backend, --secret, --log and KYLAS_API_KEY in the environment');
  process.exit(1);
}

const LEGACY = { 81181: 'Hardi', 73321: 'Mandeep', 76459: 'Praful', 87068: 'Vikas', 80618: 'Krishna', 78539: 'Vilok' };
const lastAssigned = new Map(Object.entries(JSON.parse(readFileSync(logPath, 'utf8'))).map(([id, to]) => [id, Number(to)]));

async function b2b(path, init) {
  const res = await fetch(`${backend}/b2b${path}`, {
    ...init,
    headers: { 'x-sync-key': secret, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kylas(path, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.kylas.io/v1${path}`, {
      ...init,
      headers: { 'api-key': kylasKey, 'Content-Type': 'application/json' },
    });
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 4000)); continue; }
    if (!res.ok) throw new Error(`Kylas answered ${res.status}`);
    return res.json();
  }
}

async function kylasUserNames() {
  const out = new Map();
  for (let page = 0; page < 5; page++) {
    const body = await kylas(`/users?page=${page}&size=100`);
    for (const u of body.content || []) out.set(Number(u.id), String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')));
    if (page + 1 >= Number(body.totalPages ?? 0)) break;
  }
  return out;
}

async function kylasOwners(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const body = await kylas(`/search/lead?page=0&size=${chunk.length}`, {
      method: 'POST',
      body: JSON.stringify({
        fields: ['id', 'ownerId'],
        jsonRule: { condition: 'AND', valid: true, rules: [{ operator: 'in', id: 'id', field: 'id', type: 'long', value: chunk }] },
      }),
    });
    for (const l of body.content || []) out.set(String(l.id), l.ownerId);
  }
  return out;
}

const rows = (await b2b('/rows')).filter((r) => r.pipeline === 'inbound');
const names = await kylasUserNames();
for (const [id, n] of Object.entries(LEGACY)) names.set(Number(id), n);
for (const m of (await b2b('/team')).members || []) if (m.team === 'inbound' && m.kylas_user_id) names.set(Number(m.kylas_user_id), m.name);
const leadId = (r) => String(r.kylas_lead_id || r.id);
const inKylas = await kylasOwners(rows.map(leadId).filter((id) => /^\d+$/.test(id)));

const changed = [];
const moves = new Map();
for (const r of rows) {
  const id = leadId(r);
  const stored = Number(r.meta_data?.owner_kylas_id) || null;
  const want = lastAssigned.get(id) ?? inKylas.get(id) ?? stored;
  if (!want) continue;
  const name = names.get(want) || r.owner;
  const firstWord = (v) => String(v || '').trim().split(/\s+/)[0].toLowerCase();
  if (want === stored && firstWord(name) === firstWord(r.owner)) continue;
  changed.push({ ...r, owner: name, meta_data: { ...r.meta_data, owner_kylas_id: want } });
  const key = `${names.get(stored) || stored || 'none'} -> ${name}`;
  moves.set(key, (moves.get(key) || 0) + 1);
}

console.log(`${rows.length} inbound rows, ${changed.length} change owner on the row`);
for (const [k, n] of [...moves].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
if (!apply) {
  console.log('Dry run. Add --apply to write.');
  process.exit(0);
}
for (let i = 0; i < changed.length; i += 500) {
  await b2b('/rows/bulk', { method: 'POST', body: JSON.stringify({ rows: changed.slice(i, i + 500) }) });
}
console.log(`Wrote ${changed.length} rows.`);
