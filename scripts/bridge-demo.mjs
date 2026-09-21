#!/usr/bin/env node
/*
 * Dummy data for the Client Database <-> Studio Sales bridge.
 * Writes to LIVE Supabase on both sides. Everything it creates is prefixed
 * CLI-DEMOBRIDGE / demo-bridge and `clean` removes all of it.
 *
 * `promote` issues REAL logins against the live auth project, so the password
 * is generated per run and printed once — never a constant, because this repo
 * is public and a demo account that outlives its cleanup would otherwise ship
 * working credentials. Run `clean` when you are done looking.
 *
 *   node scripts/bridge-demo.mjs seed      six dummy clients in the CRM
 *   node scripts/bridge-demo.mjs status    what each side holds right now
 *   node scripts/bridge-demo.mjs promote   give the pushed dummy firms a login,
 *                                          a referral and one approved order
 *   node scripts/bridge-demo.mjs clean     remove everything, both sides
 *
 * docs/b2b/partner-bridge.md explains why each row is shaped the way it is.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ID = 'CLI-DEMOBRIDGE';
const CRM_ENV = new URL('../.env.local', import.meta.url).pathname;
const SS_ENV = process.env.STUDIO_SALES_ENV
  || new URL('../../b2b-client-dashboard/.env.local', import.meta.url).pathname;

function env(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const crm = env(CRM_ENV);
const ss = env(SS_ENV);

const CRM_URL = crm.NEXT_PUBLIC_SUPABASE_URL;
const CRM_KEY = crm.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SS_URL = ss.NEXT_PUBLIC_SUPABASE_URL;
const SS_KEY = ss.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, v] of [['CRM url', CRM_URL], ['CRM anon key', CRM_KEY], ['Studio Sales url', SS_URL], ['Studio Sales service key', SS_KEY]]) {
  if (!v) { console.error(`Missing ${name}. Check the two .env.local files.`); process.exit(1); }
}

const rest = (base, key) => async (path, init = {}) => {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path} :: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

const crmDb = rest(CRM_URL, CRM_KEY);
const ssDb = rest(SS_URL, SS_KEY);

/*
 * Six clients chosen so that every branch of planPartnerPush() fires once:
 * two push cleanly, and the other four are each left out for a different,
 * separately-reported reason. The two sharing a number are the point of the
 * exercise — the pair is dropped rather than guessed at.
 */
const CLIENTS = [
  { n: 1, company: 'Demo Bridge Architects', type: 'Architect', phone: '9999000001', contact: 'Dummy Anita', gst: '29AAACD1234E1ZF' },
  { n: 2, company: 'Demo Bridge Interiors', type: 'Interior Designer', phone: '9999000002', contact: 'Dummy Bhaskar' },
  { n: 3, company: 'Demo Bridge Homeowner', type: 'End Consumer', phone: '9999000003', contact: 'Dummy Chandra' },
  { n: 4, company: 'Demo Bridge Untyped', type: undefined, phone: '9999000004', contact: 'Dummy Deepa' },
  { n: 5, company: 'Demo Bridge Twin A', type: 'Architect', phone: '9999000005', contact: 'Dummy Esha' },
  { n: 6, company: 'Demo Bridge Twin B', type: 'Contractor', phone: '9999000005', contact: 'Dummy Farhan' },
];

const rowFor = (c) => ({
  id: `${ID}-${c.n}`,
  pipeline: 'client',
  stage: 'Client',
  kylas_lead_id: null,
  owner: 'Tharun',
  value: 0,
  meta_data: {
    company: c.company,
    contacts: [{ number: c.phone, name: c.contact, primary: true }],
    gsts: c.gst ? [{ number: c.gst }] : [],
    segment: '2',
    client_type: c.type ?? null,
    client_type_raw: null,
    source: 'Existing',
    assignments: [],
    remarks: 'Dummy row for the partner-bridge demo. Safe to delete.',
    interactions: [],
    escalations: [],
    merged_from: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
});

async function seed() {
  const rows = CLIENTS.map(rowFor);
  await crmDb('b2b_lead', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(`seeded ${rows.length} dummy clients into the CRM Client Database`);
  for (const c of CLIENTS) console.log(`  ${ID}-${c.n}  ${c.company}  ${c.type ?? '(no type)'}  ${c.phone}`);
  console.log('\nNow open the Client Database tab and press "Push to partner dashboards".');
}

async function status() {
  const clients = await crmDb(`b2b_lead?id=like.${ID}*&select=id,meta_data`);
  console.log(`CRM Client Database: ${clients.length} dummy clients`);
  for (const r of clients) console.log(`  ${r.id}  ${r.meta_data?.company}`);

  const firms = await ssDb(`partner?md_client_id=like.${ID}*&select=id,md_client_id,firm_name,phone`);
  console.log(`\nStudio Sales: ${firms.length} linked dummy firms`);
  for (const f of firms) {
    const users = await ssDb(`partner_user?partner_id=eq.${f.id}&select=user_id`);
    const refs = await ssDb(`referral?partner_id=eq.${f.id}&select=id`);
    let orders = [];
    if (refs.length) orders = await ssDb(`referral_order?referral_id=in.(${refs.map((r) => r.id).join(',')})&select=order_value,approval_status`);
    const approved = orders.filter((o) => o.approval_status === 'approved');
    console.log(`  ${f.md_client_id}  ${f.firm_name}  login=${users.length > 0}  referrals=${refs.length}  approved orders=${approved.length}`);
  }
  if (!firms.length) console.log('  (nothing pushed yet)');
}

async function promote() {
  const firms = await ssDb(`partner?md_client_id=like.${ID}*&select=id,md_client_id,firm_name&order=md_client_id`);
  if (!firms.length) { console.log('Nothing to promote — push from the Client Database first.'); return; }

  for (const f of firms) {
    const email = `${f.md_client_id.toLowerCase()}@demo-bridge.invalid`;
    const existing = await ssDb(`partner_user?partner_id=eq.${f.id}&select=user_id`);
    if (!existing.length) {
      const pw = `Demo-${randomBytes(9).toString('base64url')}`;
      const res = await fetch(`${SS_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SS_KEY, Authorization: `Bearer ${SS_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw, email_confirm: true }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 422) throw new Error(`auth create failed: ${JSON.stringify(body).slice(0, 200)}`);
      const userId = body.id || (await (await fetch(`${SS_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: { apikey: SS_KEY, Authorization: `Bearer ${SS_KEY}` } })).json()).users?.[0]?.id;
      await ssDb('partner_user', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ user_id: userId, partner_id: f.id, role: 'principal' }]),
      });
      console.log(`  ${f.firm_name}: login issued — ${email} / ${pw}`);
    }

    const refs = await ssDb(`referral?partner_id=eq.${f.id}&md_phone=eq.9999100001&select=id`);
    let referralId = refs[0]?.id;
    if (!referralId) {
      const made = await ssDb('referral', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{ partner_id: f.id, client_name: 'Dummy Referred Client', md_phone: '9999100001', notes: 'partner-bridge demo' }]),
      });
      referralId = made[0].id;
    }
    await ssDb('referral_order', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        referral_id: referralId,
        md_enq_id: `DEMOBRIDGE-${f.md_client_id}`,
        order_value: 250000,
        approval_status: 'approved',
        store: 'Demo EC',
      }]),
    });
    console.log(`  ${f.firm_name}: 1 referral + 1 approved order (Rs 2,50,000)`);
  }
  console.log('\nReload the CRM: those firms now read "Power user" and Referral Orders is no longer zero.');
}

async function clean() {
  const firms = await ssDb(`partner?md_client_id=like.${ID}*&select=id,md_client_id`);
  for (const f of firms) {
    const refs = await ssDb(`referral?partner_id=eq.${f.id}&select=id`);
    for (const r of refs) await ssDb(`referral_order?referral_id=eq.${r.id}`, { method: 'DELETE' });
    await ssDb(`referral?partner_id=eq.${f.id}`, { method: 'DELETE' });
    const users = await ssDb(`partner_user?partner_id=eq.${f.id}&select=user_id`);
    await ssDb(`partner_user?partner_id=eq.${f.id}`, { method: 'DELETE' });
    for (const u of users) {
      await fetch(`${SS_URL}/auth/v1/admin/users/${u.user_id}`, {
        method: 'DELETE', headers: { apikey: SS_KEY, Authorization: `Bearer ${SS_KEY}` },
      });
    }
    await ssDb(`partner?id=eq.${f.id}`, { method: 'DELETE' });
    console.log(`removed Studio Sales firm ${f.md_client_id}`);
  }
  await crmDb(`b2b_lead?id=like.${ID}*`, { method: 'DELETE' });
  console.log('removed the dummy clients from the CRM Client Database');
}

const cmd = process.argv[2];
const run = { seed, status, promote, clean }[cmd];
if (!run) {
  console.error('usage: node scripts/bridge-demo.mjs seed|status|promote|clean');
  process.exit(1);
}
run().catch((e) => { console.error(e.message); process.exit(1); });
