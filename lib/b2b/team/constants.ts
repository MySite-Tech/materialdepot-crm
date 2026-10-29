import { B2BTeam } from './types';

export const B2B_SALES_ROLES = new Set(['superadmin', 'admin', 'manager', 'tech', 'b2b_sales', 'b2b_KAM', 'b2b_manager']);

export const B2B_MANAGER_ROLES = new Set(['superadmin', 'admin', 'b2b_manager']);

export const B2B_ACCESS_SLUG = 'crm.b2b_sales';

export const B2B_MANAGER_SLUG = 'b2b.manager';

export const B2B_TEAMS: { key: B2BTeam; label: string }[] = [
  { key: 'inbound', label: 'Inbound' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'kam', label: 'KAM' },
];

// Kylas user (Hardi) that every Presales-qualified B2B lead is created under.
export const INBOUND_INTAKE_KYLAS_ID = 81181;

export const INBOUND_ROTATION_START = '2026-10-29T00:00:00+05:30';

export const INBOUND_ROTATION_WINDOW_DAYS = 7;

export const INBOUND_ROTATION_BATCH = 25;

export const INBOUND_ROTATION_MAX_PAGES = 3;
