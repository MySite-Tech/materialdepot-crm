import { getToken, refreshSession } from '../api/core/client';
import type { AccessRow, BankLead, BankState, BdaAccess, CallLog, CallOutcome, Claim, ImportDiag, ImportRun, Priority } from './types';

const ROUTE = '/api/bda-retail';
const BATCH = 1000;

async function send(init: RequestInit = {}, retried = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${getToken()}`,
  };
  const res = await fetch(ROUTE, { ...init, cache: 'no-store', headers });
  if (res.status === 401 && !retried && (await refreshSession())) return send(init, true);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`);
  return body;
}

const post = (payload: Record<string, unknown>) =>
  send({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export const fetchBank = async (): Promise<{ bank: BankState; access: BdaAccess; admins: AccessRow[] }> => {
  const body = await send();
  return { bank: body.bank as BankState, access: body.access as BdaAccess, admins: (body.admins as AccessRow[]) ?? [] };
};

export async function importLeads(
  leads: BankLead[],
  summary: { skippedActive: number; byCohort: ImportRun['byCohort']; read: Record<string, number>; diag: ImportDiag },
  step: (s: string) => void,
): Promise<ImportRun> {
  const total = { added: 0, refreshed: 0, samePerson: 0 };
  for (let i = 0; i < leads.length; i += BATCH) {
    step(`Saving ${Math.min(i + BATCH, leads.length).toLocaleString('en-IN')} of ${leads.length.toLocaleString('en-IN')}`);
    const r = await post({ action: 'import-leads', leads: leads.slice(i, i + BATCH) });
    total.added += Number(r.added) || 0;
    total.refreshed += Number(r.refreshed) || 0;
    total.samePerson += Number(r.samePerson) || 0;
  }
  return (await post({ action: 'import-run', ...total, ...summary })).run as ImportRun;
}

export const claimLead = async (key: string): Promise<Claim> => (await post({ action: 'claim', key })).claim as Claim;

export const releaseLead = async (key: string): Promise<void> => {
  await post({ action: 'release', key });
};

export const logCall = async (key: string, outcome: CallOutcome, note: string, followUpOn: string): Promise<CallLog> =>
  (await post({ action: 'call', key, outcome, note, followUpOn })).call as CallLog;

export const savePlan = async (month: string, priorities: Priority[] | null): Promise<void> => {
  await post({ action: 'plan', month, priorities });
};
