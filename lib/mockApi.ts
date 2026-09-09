/* Barrel for the API layer, which lives in lib/api/*.
   Every existing call site imports from '@/lib/mockApi', so this file stays the
   public entry point; pick the module directly when adding new code.

   The name is a leftover from when this was a Supabase mock. Nothing here is
   mocked — client.ts talks to Django, kylasClient.ts talks to Kylas. */

export * from './api/client';
export * from './api/kylasClient';
export * from './api/auth';
export * from './api/escalation';
export * from './api/branches';
export * from './api/storeVisit';
export * from './api/b2bInbound';
export * from './api/crmLeads';
export * from './api/leadDetails';
export * from './api/dashboards';
export * from './api/clientProperties';
export * from './api/clientInfoTasks';
export * from './api/users';
export * from './api/kylasSync';
export * from './api/weeklyFunnel';
export * from './api/reportCard';
export * from './api/nps';
