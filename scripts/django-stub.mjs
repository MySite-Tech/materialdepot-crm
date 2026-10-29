import { spawn } from 'node:child_process';
import { serve } from './stub/http.mjs';
import { djangoRouter, localUser } from './stub/django.mjs';

const STUB_PORT = Number(process.env.STUB_PORT || 4000);
const APP_PORT = Number(process.env.APP_PORT || 3100);
const ROLE = process.env.STUB_ROLE || 'admin';
const PERMISSIONS = (process.env.STUB_PERMISSIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const BASE = `http://localhost:${STUB_PORT}/apiV1`;

const user = localUser(ROLE, PERMISSIONS);
const route = djangoRouter({
  userForPhone: user,
  userForId: () => user(),
  roster: () => [user()],
});

serve(STUB_PORT, route, () => {
  console.log(`Django stub on ${BASE} as role "${ROLE}" — any phone, any 4-digit OTP`);
  if (process.argv.includes('--stub-only')) return;
  const env = { ...process.env, NEXT_PUBLIC_API_BASE_URL: BASE, API_BASE_URL: BASE };
  const app = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], { env, stdio: 'inherit' });
  app.on('exit', (code) => process.exit(code ?? 0));
});
