import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const STUB_PORT = Number(process.env.STUB_PORT || 4000);
const APP_PORT = Number(process.env.APP_PORT || 3100);
const ROLE = process.env.STUB_ROLE || 'admin';
const PERMISSIONS = (process.env.STUB_PERMISSIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const USER_ID = 900001;
const BASE = `http://localhost:${STUB_PORT}/apiV1`;

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
  user_id: USER_ID, exp: Math.floor(Date.now() / 1000) + 30 * 86400,
})}.stub`;

let phone = '9999999999';

const profile = () => ({
  id: USER_ID, name: `Local ${ROLE}`, phone, role: ROLE,
  allowedBranches: [], individualPermissions: PERMISSIONS,
});

const rosterRow = () => ({
  id: USER_ID, status: true,
  user: { id: USER_ID, f_name: 'Local', l_name: ROLE, contact: phone },
  branch: [], user_permission_detail: { id: 0, permission_name: ROLE },
  individual_permissions: PERMISSIONS,
});

const envelope = (data) => ({ success: true, status: 200, data });

function route(path, query) {
  if (path.endsWith('/login-otp/')) {
    phone = query.get('contact') || phone;
    return envelope({ sent: true });
  }
  if (path.endsWith('/verify-otp/')) {
    phone = query.get('contact') || phone;
    return { token: jwt(), refresh: jwt() };
  }
  if (path.endsWith('/token/refresh/')) return { access: jwt(), refresh: jwt() };
  if (path.endsWith('/crm/user-profile/')) return envelope(profile());
  if (path.endsWith('/user-organisation/')) return envelope([rosterRow()]);
  return [];
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, BASE);
  const body = route(url.pathname, url.searchParams);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}).listen(STUB_PORT, () => {
  console.log(`Django stub on ${BASE} as role "${ROLE}" — any phone, any 4-digit OTP`);
  if (process.argv.includes('--stub-only')) return;
  const env = { ...process.env, NEXT_PUBLIC_API_BASE_URL: BASE, API_BASE_URL: BASE };
  const app = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], { env, stdio: 'inherit' });
  app.on('exit', (code) => process.exit(code ?? 0));
});
