import { getToken, refreshSession } from '@/lib/api/core/client';
import type { ClientImportOutcome, ClientImportPlan, ClientImportScope } from './types';

async function call<T>(method: 'GET' | 'POST', scope: ClientImportScope, retried = false): Promise<T> {
  const res = await fetch(`/api/b2b/client-import?scope=${scope}`, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401 && !retried && await refreshSession()) return call(method, scope, true);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export const previewClientImport = (scope: ClientImportScope) => call<ClientImportPlan>('GET', scope);

export const runClientImport = (scope: ClientImportScope) => call<ClientImportOutcome>('POST', scope);
