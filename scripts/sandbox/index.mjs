import { spawn } from 'node:child_process';
import { jsonOf, serve } from '../stub/http.mjs';
import { BRANCHES, PERSONAS, STATE_FILE, SYNC_KEY } from './constants.mjs';
import { loadState, persist } from './state.mjs';
import { backendRoutes } from './routes/b2b-backend.mjs';
import { djangoRoutes } from './routes/django.mjs';
import { kylasRoutes } from './routes/kylas.mjs';

const PORT = Number(process.env.STUB_PORT || 4000);
const APP_PORT = Number(process.env.APP_PORT || 3100);
const ORIGIN = `http://localhost:${PORT}`;

const { state, fresh } = loadState({ reset: process.argv.includes('--reset') });

function partnerRoutes(db) {
  return ({ method, path, raw }) => {
    if (path === '/api/sync/waitlist') return { signups: [] };
    if (path !== '/api/sync/content') return [];
    if (method !== 'POST') return db;
    const body = jsonOf(raw) ?? {};
    for (const kind of ['banners', 'launches']) {
      const drop = new Set([...(body.remove?.[kind] ?? []), ...(body[kind] ?? []).map((r) => r.md_ref)].map(String));
      db[kind] = [...db[kind].filter((r) => !drop.has(String(r.md_ref))), ...(body[kind] ?? [])];
    }
    return db;
  };
}

const PREFIXES = [
  ['/apiV1', djangoRoutes(state.django), false],
  ['/b2b-backend', backendRoutes(state.backend), true],
  ['/kylas/v1', kylasRoutes(state.kylas), true],
  ['/partner', partnerRoutes(state.partner), true],
];

async function handle(req) {
  const hit = PREFIXES.find(([prefix]) => req.path === prefix || req.path.startsWith(`${prefix}/`));
  if (!hit) return [];
  const [prefix, route, strip] = hit;
  const out = await route(strip ? { ...req, path: req.path.slice(prefix.length) || '/' } : req);
  if (req.method !== 'GET') persist(state);
  return out;
}

const APP_ENV = {
  NEXT_PUBLIC_API_BASE_URL: `${ORIGIN}/apiV1`,
  API_BASE_URL: `${ORIGIN}/apiV1`,
  NEXT_PUBLIC_KYLAS_API_BASE_URL: `${ORIGIN}/kylas/v1`,
  KYLAS_API_BASE_URL: `${ORIGIN}/kylas/v1`,
  KYLAS_API_KEY: SYNC_KEY,
  B2B_BACKEND_URL: `${ORIGIN}/b2b-backend`,
  B2B_BACKEND_SECRET: SYNC_KEY,
  PARTNER_APP_BASE_URL: `${ORIGIN}/partner`,
  PARTNER_SYNC_SECRET: SYNC_KEY,
  SUPABASE_SERVICE_ROLE_KEY: 'sandbox-disabled',
};

serve(PORT, handle, () => {
  console.log(`B2B sandbox on ${ORIGIN} (Django /apiV1, B2B backend /b2b-backend, Kylas /kylas/v1, partner app /partner)`);
  console.log(`State: ${STATE_FILE} (${fresh ? 'freshly seeded' : 'kept from the last run; --reset reseeds'})`);
  console.log(`Log in with any 4-digit OTP as: ${PERSONAS.map((p) => `${p.phone} ${p.name}`).join(' · ')}`);
  console.log(`Branches: ${BRANCHES.map((b) => b.branch_name).join(', ')}. Any other phone logs in as a local admin.`);
  if (process.argv.includes('--stub-only')) {
    console.log(`Start the app against it with:\n${Object.entries(APP_ENV).map(([k, v]) => `${k}=${v}`).join(' \\\n')} \\\nnpx next dev -p ${APP_PORT}`);
    return;
  }
  const app = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], { env: { ...process.env, ...APP_ENV }, stdio: 'inherit' });
  app.on('exit', (code) => process.exit(code ?? 0));
});
