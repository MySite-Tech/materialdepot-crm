import { Stakeholder, StakeholderRole } from './types';

export const STAKEHOLDERS: Record<StakeholderRole, Stakeholder> = {
  bm: {
    code: 'BM',
    label: 'Business Manager',
    tier: 'Frontline',
    depth: 0,
    reportsTo: 'tl',
    crmRoles: ['sales'],
    owns: 'Client context capture, follow-ups, pipeline and first-level escalation',
    reviewedOn: 'Twice a week by the Team Leader',
  },
  receptionist: {
    code: 'R',
    label: 'Receptionist',
    tier: 'Frontline',
    depth: 0,
    reportsTo: 'sm',
    crmRoles: ['retail'],
    owns: 'Footfall data, BM assignment, NPS, pre-booked visits and store readiness',
    reviewedOn: 'Weekly (Wednesday) by the Store Manager',
  },
  tl: {
    code: 'TL',
    label: 'Team Leader',
    tier: 'Store leadership',
    depth: 1,
    reportsTo: 'sm',
    crmRoles: ['team_leader'],
    owns: 'Daily BM adherence, cart reviews and carts above 25k',
    reviewedOn: 'Twice a week by the Store Manager',
  },
  asm: {
    code: 'ASM',
    label: 'Assistant Store Manager',
    tier: 'Store leadership',
    depth: 2,
    reportsTo: 'sm',
    crmRoles: ['asst_store_manager'],
    owns: 'Store-wide adherence, ROTA, procurement links and carts above 50k',
    reviewedOn: 'Twice a week by the Store Manager',
  },
  sm: {
    code: 'SM',
    label: 'Store Manager',
    tier: 'Store leadership',
    depth: 3,
    reportsTo: 'cluster_head',
    crmRoles: ['store_manager'],
    owns: 'The store end to end, and personally closing carts above 1L',
    reviewedOn: 'By the Cluster Head',
  },
  cluster_head: {
    code: 'CH',
    label: 'Cluster Head',
    tier: 'Above store',
    depth: 4,
    reportsTo: 'area_manager',
    crmRoles: ['cluster_head'],
    owns: 'A cluster of stores — target vs achievement and escalations across them',
    reviewedOn: 'By the Area Manager',
  },
  area_manager: {
    code: 'AM',
    label: 'Area Manager',
    tier: 'Above store',
    depth: 5,
    reportsTo: 'central',
    crmRoles: ['manager', 'area_manager'],
    owns: 'An area of clusters — store targets, escalations and EC condition',
    reviewedOn: 'By the Central Team',
  },
  central: {
    code: 'CT',
    label: 'Admin / Central Team',
    tier: 'Above store',
    depth: 6,
    reportsTo: null,
    crmRoles: ['admin', 'superadmin', 'tech'],
    owns: 'Company-wide target vs achievement, escalations and accounts',
    reviewedOn: 'Top of the chain',
  },
};

export const STAKEHOLDER_ORDER: StakeholderRole[] =
  (Object.keys(STAKEHOLDERS) as StakeholderRole[]).sort((a, b) => STAKEHOLDERS[b].depth - STAKEHOLDERS[a].depth);

export const TEAM_PAGE_SIZE = 25;

export const STATS_BATCH = 50;
