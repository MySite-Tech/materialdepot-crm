import { Stakeholder, StakeholderRole } from './types';

export const STAKEHOLDERS: Record<StakeholderRole, Stakeholder> = {
  bm: {
    code: 'BM',
    label: 'Business Manager',
    tier: 'Frontline',
    depth: 0,
    reportsTo: 'tl',
    alsoVisibleTo: ['asm'],
    crmRoles: ['sales'],
    owns: 'Client context capture, follow-ups, pipeline and first-level escalation',
    reviewedOn: 'Twice a week by the TL',
  },
  receptionist: {
    code: 'R',
    label: 'Receptionist',
    tier: 'Frontline',
    depth: 0,
    reportsTo: 'sm',
    alsoVisibleTo: ['asm'],
    crmRoles: ['retail'],
    owns: 'Footfall data, BM assignment, NPS, pre-booked visits and store readiness',
    reviewedOn: 'Weekly (Wednesday) by the SM',
  },
  tl: {
    code: 'TL',
    label: 'Team Leader',
    tier: 'Store leadership',
    depth: 1,
    reportsTo: 'sm',
    alsoVisibleTo: ['asm'],
    crmRoles: [],
    owns: 'Daily BM adherence, cart reviews and carts above 25k',
    reviewedOn: 'Twice a week by the SM',
  },
  asm: {
    code: 'AM',
    label: 'Assistant Store Manager',
    tier: 'Store leadership',
    depth: 2,
    reportsTo: 'sm',
    alsoVisibleTo: [],
    crmRoles: [],
    owns: 'Store-wide adherence, ROTA, procurement links and carts above 50k',
    reviewedOn: 'Twice a week by the SM',
  },
  sm: {
    code: 'SM',
    label: 'Store Manager',
    tier: 'Store leadership',
    depth: 3,
    reportsTo: 'central',
    alsoVisibleTo: [],
    crmRoles: ['store_manager'],
    owns: 'The store end to end, and personally closing carts above 1L',
    reviewedOn: 'By the Area Sales Manager / Central Team',
  },
  central: {
    code: 'CT',
    label: 'Area Sales Manager / Central Team',
    tier: 'Central',
    depth: 4,
    reportsTo: null,
    alsoVisibleTo: [],
    crmRoles: ['manager', 'admin', 'superadmin', 'tech'],
    owns: 'Store target vs achievement, escalations, EC condition and accounts',
    reviewedOn: 'Top of the chain',
  },
};

export const STAKEHOLDER_ORDER: StakeholderRole[] = ['central', 'sm', 'asm', 'tl', 'receptionist', 'bm'];

export const TEAM_PAGE_SIZE = 25;
