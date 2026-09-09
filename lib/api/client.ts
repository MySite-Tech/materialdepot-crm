export const API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";

const TOKEN_KEY = 'jwt_token';
const REFRESH_KEY = 'refresh_token';

export function getToken(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || '';
}

function getRefreshToken(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(REFRESH_KEY)) || '';
}

export function saveToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function saveRefreshToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

function forceReLogin() {
  clearToken();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('materialdepot_user');
    window.location.reload();
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.access) return false;
    saveToken(data.access);
    if (data.refresh) saveRefreshToken(data.refresh);
    return true;
  } catch {
    return false;
  }
}

function isAuthFailureBody(bodyText: string): boolean {
  if (!bodyText) return false;
  let detail = '';
  let code = '';
  try {
    const j = JSON.parse(bodyText);
    detail = String(j?.detail ?? j?.error?.message ?? '');
    code = String(j?.code ?? j?.error?.code ?? j?.messages?.[0]?.message ?? '');
  } catch {
    detail = bodyText;
  }
  const s = `${detail} ${code}`.toLowerCase();
  return (
    s.includes('authentication credentials were not provided') ||
    s.includes('token_not_valid') ||
    s.includes('token not valid') ||
    s.includes('not authenticated')
  );
}

function unwrapEnvelope(body: any): any {
  if (
    body && typeof body === 'object' && !Array.isArray(body)
    && body.success === true && 'data' in body && 'status' in body
  ) {
    return body.data;
  }
  return body;
}

export async function mdFetch(path: string, init?: RequestInit, retried = false): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if ((res.status === 401 || res.status === 403) && !retried) {
    const body = await res.text();
    if (res.status === 401 || isAuthFailureBody(body)) {
      if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      const ok = await refreshPromise;
      if (ok) return mdFetch(path, init, true);
      forceReLogin();
      throw new Error('Session expired');
    }
    throw new Error('You do not have access to this resource.');
  }
  if (!res.ok) {

    let msg = `API error: ${res.status}`;
    try {
      const j = JSON.parse(await res.text());
      msg = (typeof j?.data === 'string' && j.data)
        || j?.detail || j?.message
        || (typeof j?.error === 'string' ? j.error : j?.error?.message)
        || msg;
    } catch { /* non-JSON body — keep the status message */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? unwrapEnvelope(JSON.parse(text)) : null;
}
