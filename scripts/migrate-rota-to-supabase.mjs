// One-time migration: copy the rota plan off Kylas lead 39871021's
// `cfResourceplanjson` field into the `rota_plan` Supabase table.
//
//   node --env-file=.env scripts/migrate-rota-to-supabase.mjs [--dry-run]
//
// Idempotent — re-running just re-upserts the same rows. The Kylas field is
// left untouched, so the standalone MD-Appointment-tracker app and its `access`
// map keep working, and this stays trivially revertible.

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');

const BRANCHES = ['JP Nagar', 'Yelahanka', 'Whitefield', 'Gachibowli', 'Kompally', 'HSR'];
const KYLAS_API_BASE = process.env.KYLAS_API_BASE_URL || 'https://api.kylas.io/v1';
const SETTINGS_LEAD_ID = '39871021';
const CONFIG_FIELD = 'cfResourceplanjson';

const { KYLAS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
// A dry run only reads Kylas, so it deliberately doesn't require the Supabase
// credentials — you can preview the migration before wiring the service key up.
const required = DRY
  ? { KYLAS_API_KEY }
  : { KYLAS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
for (const [k, v] of Object.entries(required)) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const res = await fetch(`${KYLAS_API_BASE}/leads/${SETTINGS_LEAD_ID}`, {
  headers: { 'api-key': KYLAS_API_KEY },
});
if (!res.ok) { console.error(`Kylas read failed: ${res.status} ${await res.text()}`); process.exit(1); }

const raw = (await res.json())?.customFieldValues?.[CONFIG_FIELD];
if (typeof raw !== 'string' || !raw.trim()) { console.error('Kylas field is empty — nothing to migrate.'); process.exit(1); }

const parsed = JSON.parse(raw);
// New shape is { plan, access }; the legacy shape was a bare plan object.
const plan = ('plan' in parsed || 'access' in parsed) ? parsed.plan : parsed;
if (!plan?.branches) { console.error('No plan.branches found in the stored JSON.'); process.exit(1); }

const rows = [];
for (const [branch, data] of Object.entries(plan.branches)) {
  if (!BRANCHES.includes(branch)) { console.warn(`skipping unknown branch: ${branch}`); continue; }
  rows.push({
    branch,
    members: Array.isArray(data?.members) ? data.members : [],
    weeks: data?.weeks && typeof data.weeks === 'object' ? data.weeks : {},
    updated_at: new Date().toISOString(),
    updated_by: 'migration',
  });
}

for (const r of rows) {
  console.log(`  ${r.branch.padEnd(12)} members=${String(r.members.length).padStart(2)}  weeks=${Object.keys(r.weeks).join(', ') || '-'}`);
}

if (DRY) { console.log(`\nDry run — ${rows.length} rows would be written.`); process.exit(0); }

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { error } = await supabase.from('rota_plan').upsert(rows, { onConflict: 'branch' });
if (error) { console.error('Supabase write failed:', error.message); process.exit(1); }

console.log(`\nMigrated ${rows.length} branches into rota_plan.`);
