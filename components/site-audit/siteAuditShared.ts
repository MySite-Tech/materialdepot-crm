/* Barrel for the Site Audit shared layer, which lives in ./shared/*.
   Roughly 30 modules import from this path, so it stays the entry point; pick
   the module directly when adding new code.

   Everything here talks to the field app's own Supabase project (separate from
   the CRM's) — see shared/sbClient.ts for the transport and its query cache. */

export * from './shared/sbClient';
export * from './shared/photos';
export * from './shared/writeSanitize';
export * from './shared/auditOwner';
export * from './shared/staffExit';
export * from './shared/roles';
export * from './shared/availability';
export * from './shared/cityScope';
export * from './shared/identity';
export * from './shared/ownProfile';
export * from './shared/bmLink';
export * from './shared/roleSync';
export * from './shared/format';
