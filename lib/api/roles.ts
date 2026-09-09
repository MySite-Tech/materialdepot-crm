/* Roles the CRM never surfaces as CRM users — they have accounts for other
   systems. Both the login (auth.ts) and the roster (users.ts) filter on it, so
   it lives here rather than in either one. */
export const EXCLUDED_ROLES = new Set(['data', 'delivery']);
