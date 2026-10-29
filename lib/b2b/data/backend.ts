import { getToken, refreshSession } from '@/lib/api/core/client';

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(`/api/b2b${path}`, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return call<T>(path, init, true);
  }
  const body = (await res.json().catch(() => null)) as T & { error?: unknown };
  if (!res.ok) {
    const msg = body && typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export const b2bBackendGet = <T,>(path: string): Promise<T> => call<T>(path);

export const b2bBackendPost = <T,>(path: string, data: unknown): Promise<T> =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const b2bBackendDelete = <T,>(path: string): Promise<T> => call<T>(path, { method: 'DELETE' });

export const b2bBackendPut = <T,>(path: string, data: unknown): Promise<T> =>
  call<T>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
