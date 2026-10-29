import { normalisePhone } from '@/lib/org/utils';
import { B2B_INBOUND_PIPELINE, B2B_INBOUND_STAGES } from '@/lib/api/b2b/inbound/constants';
import { INBOUND_INTAKE_KYLAS_ID, INBOUND_ROTATION_MAX_PAGES } from '@/lib/b2b/team/constants';
import type { KylasUser } from '@/lib/b2b/team/types';

const BASE = (process.env.KYLAS_API_BASE_URL || 'https://api.kylas.io/v1').replace(/\/+$/, '');
const USER_PAGE = 100;
const POOL_PAGE = 200;

export interface PoolLead {
  id: string;
  createdAt: string;
}

export interface KylasLead {
  id: string;
  ownerId: number | null;
  pipelineId: number | null;
  createdAt: string | null;
}

async function kylas(path: string, init?: RequestInit): Promise<Record<string, any>> {
  const key = process.env.KYLAS_API_KEY;
  if (!key) throw new Error('KYLAS_API_KEY is not set');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'api-key': key, ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach Kylas');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.message || body?.errorCode;
    throw new Error(`Kylas answered ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return body ?? {};
}

export async function listKylasUsers(): Promise<KylasUser[]> {
  const out: KylasUser[] = [];
  for (let page = 0; page < 5; page++) {
    const body = await kylas(`/users?page=${page}&size=${USER_PAGE}`);
    const content: Record<string, any>[] = Array.isArray(body.content) ? body.content : [];
    for (const u of content) {
      const primary = (u.phoneNumbers || []).find((p: any) => p?.primary) ?? u.phoneNumbers?.[0];
      out.push({
        id: Number(u.id),
        name: String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')),
        phone: normalisePhone(primary?.value),
        active: u.active !== false,
      });
    }
    if (page + 1 >= Number(body.totalPages ?? 0)) break;
  }
  return out;
}

export function kylasUserForPhone(users: KylasUser[], phone: string): KylasUser | null {
  const want = normalisePhone(phone);
  if (want.length !== 10) return null;
  const hits = users.filter((u) => u.phone === want);
  return hits.find((u) => u.active) ?? hits[0] ?? null;
}

export async function intakePool(sinceIso: string): Promise<PoolLead[]> {
  const rule = {
    fields: ['id', 'createdAt', 'ownerId'],
    jsonRule: {
      condition: 'AND',
      valid: true,
      rules: [
        { operator: 'equal', id: 'ownerId', field: 'ownerId', type: 'long', value: INBOUND_INTAKE_KYLAS_ID },
        { operator: 'equal', id: 'pipeline', field: 'pipeline', type: 'long', value: B2B_INBOUND_PIPELINE },
        { operator: 'in', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: B2B_INBOUND_STAGES, relatedFieldIds: ['pipeline'] },
        { operator: 'greater', id: 'createdAt', field: 'createdAt', type: 'date', value: sinceIso, timeZone: 'Asia/Calcutta' },
      ],
    },
  };
  const out: PoolLead[] = [];
  for (let page = 0; page < INBOUND_ROTATION_MAX_PAGES; page++) {
    const body = await kylas(`/search/lead?sort=createdAt,asc&page=${page}&size=${POOL_PAGE}`, {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    const content: Record<string, any>[] = Array.isArray(body.content) ? body.content : [];
    for (const l of content) {
      if (l.ownerId === INBOUND_INTAKE_KYLAS_ID) out.push({ id: String(l.id), createdAt: String(l.createdAt) });
    }
    if (page + 1 >= Number(body.totalPages ?? 0)) break;
  }
  return out;
}

export async function readLead(id: string): Promise<KylasLead> {
  const d = await kylas(`/leads/${encodeURIComponent(id)}`);
  return {
    id: String(d.id),
    ownerId: typeof d.ownerId === 'number' ? d.ownerId : null,
    pipelineId: typeof d.pipeline?.id === 'number' ? d.pipeline.id : null,
    createdAt: d.createdAt ? String(d.createdAt) : null,
  };
}

export async function setLeadOwner(id: string, ownerId: number): Promise<void> {
  const body = await kylas(`/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([{ op: 'replace', path: '/ownerId', value: ownerId }]),
  });
  const now = typeof body.ownerId === 'number' ? body.ownerId : (await readLead(id)).ownerId;
  if (now !== ownerId) throw new Error(`Kylas accepted the change but the lead is still owned by ${now ?? 'nobody'}`);
}
