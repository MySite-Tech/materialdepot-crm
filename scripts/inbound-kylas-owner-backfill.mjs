#!/usr/bin/env node
// node scripts/inbound-kylas-owner-backfill.mjs --backend <url> --secret <x-sync-key> [--apply]
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const backend = (arg('backend') || '').replace(/\/+$/, '');
const secret = arg('secret');
const apply = process.argv.includes('--apply');
const kylasKey = process.env.KYLAS_API_KEY;
if (!backend || !secret || !kylasKey) {
  console.error('Needs --backend, --secret and KYLAS_API_KEY in the environment');
  process.exit(1);
}

const LEGACY_B2B = [81181, 73321, 76459, 87068, 80618, 78539];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function b2b(path) {
  const res = await fetch(`${backend}/b2b${path}`, { headers: { 'x-sync-key': secret } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kylas(path, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.kylas.io/v1${path}`, {
      ...init,
      headers: { 'api-key': kylasKey, 'Content-Type': 'application/json', ...init?.headers },
    });
    if ((res.status === 429 || res.status === 503) && attempt < 8) { await pause(4000); continue; }
    if (!res.ok) throw new Error(`Kylas answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}

async function kylasUsers() {
  const out = new Map();
  for (let page = 0; page < 5; page++) {
    const body = await kylas(`/users?page=${page}&size=100`);
    for (const u of body.content || []) {
      out.set(Number(u.id), { name: String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')), active: u.active !== false });
    }
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
    for (const l of body.content || []) out.set(String(l.id), Number(l.ownerId));
  }
  return out;
}

const rows = (await b2b('/rows')).filter((r) => r.pipeline === 'inbound');
const users = await kylasUsers();
const leadId = (r) => String(r.kylas_lead_id || r.id);
const inKylas = await kylasOwners(rows.map(leadId).filter((id) => /^\d+$/.test(id)));
const nameOf = (id) => users.get(id)?.name || String(id);
const team = (await b2b('/team')).members || [];
const b2bIds = new Set([...LEGACY_B2B, ...team.map((m) => Number(m.kylas_user_id)).filter(Boolean)]);

const moves = [];
const skipped = new Map();
const skip = (why) => skipped.set(why, (skipped.get(why) || 0) + 1);
for (const r of rows) {
  const id = leadId(r);
  const want = Number(r.meta_data?.owner_kylas_id) || null;
  const now = inKylas.get(id);
  if (!want) { skip('no owner in the CRM'); continue; }
  if (now === undefined) { skip('not found in Kylas'); continue; }
  if (now === want) continue;
  if (!users.get(want)?.active) { skip(`CRM owner ${nameOf(want)} is not an active Kylas user`); continue; }
  if (!b2bIds.has(now)) { skip(`Kylas has it with ${nameOf(now)}, outside B2B, so it is left there`); continue; }
  moves.push({ id, from: now, to: want, stage: r.stage });
}

const byPair = new Map();
for (const m of moves) {
  const key = `${nameOf(m.from)} -> ${nameOf(m.to)}`;
  byPair.set(key, (byPair.get(key) || 0) + 1);
}
console.log(`${rows.length} inbound rows, ${inKylas.size} found in Kylas, ${moves.length} owned by someone else there`);
for (const [k, n] of [...byPair].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
for (const [k, n] of skipped) console.log(`  skipped ${n}: ${k}`);
if (!apply) {
  console.log('Dry run. Add --apply to write these owners to Kylas.');
  process.exit(0);
}

let written = 0;
const failed = [];
for (const m of moves) {
  try {
    const body = await kylas(`/leads/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([{ op: 'replace', path: '/ownerId', value: m.to }]),
    });
    if (typeof body.ownerId === 'number' && body.ownerId !== m.to) throw new Error(`Kylas kept user ${body.ownerId}`);
    written += 1;
  } catch (e) {
    failed.push(`${m.id}: ${e.message}`);
  }
  await pause(400);
}
console.log(`Wrote ${written} owners to Kylas, ${failed.length} failed.`);
for (const f of failed.slice(0, 20)) console.log(`  ${f}`);
