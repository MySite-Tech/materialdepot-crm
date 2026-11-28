import type { BridgeKey, JourneyLens, JourneyPath } from '@/lib/b2b/revenue/journey';

export const LENS_LABEL: Record<JourneyLens, string> = { studio: 'Studio Sales', all: 'All B2B' };

export const LENS_HINT: Record<JourneyLens, string> = {
  studio: 'Direct, Studio EC Redirected and Referred. A firm counts only for its Studio orders; EC Direct firms are the pool Studio grows from.',
  all: 'Every B2B channel, EC Direct included.',
};

export const COLOR = {
  studio: '#4F46E5',
  ec: '#0891B2',
  revived: '#D97706',
  new: '#059669',
  returning: '#7C3AED',
  storeBuyer: '#DB2777',
  none: '#9CA3AF',
  gain: '#059669',
  loss: '#DC2626',
  total: '#111827',
} as const;

export const PATH_LABEL: Record<JourneyPath, string> = {
  stayedStudio: 'Stayed Studio',
  stayedEc: 'Stayed EC Direct',
  ecToStudio: 'EC → Studio',
  studioToEc: 'Studio → EC',
  lostStudio: 'Stopped (was Studio)',
  lostEc: 'Stopped (was EC Direct)',
  new: 'New client',
  revived: 'Revived',
  returning: 'Skipped the first month',
  storeBuyer: 'Store buyer → B2B',
};

export const PATH_HINT: Record<JourneyPath, string> = {
  stayedStudio: 'Ordered through Studio Sales in both months.',
  stayedEc: 'Ordered only EC Direct in both months: their B2B tie-up has not started.',
  ecToStudio: 'Only EC Direct in the first month, Studio Sales in the second.',
  studioToEc: 'Studio in the first month, only EC Direct in the second. Rare by design.',
  lostStudio: 'Studio in the first month, no order in the second.',
  lostEc: 'EC Direct in the first month, no order in the second.',
  new: 'Not in the first month. In their first month back, no order with Material Depot in the 12 months before.',
  revived: 'Not in the first month. Back after 3 or more empty months.',
  returning: 'Not in the first month, but ordered in the months just before it.',
  storeBuyer: 'Not in the first month. Ordered before as a store buyer, not yet a B2B client.',
};

export const PATH_COLOR: Record<JourneyPath, string> = {
  stayedStudio: COLOR.studio,
  stayedEc: COLOR.ec,
  ecToStudio: COLOR.studio,
  studioToEc: COLOR.ec,
  lostStudio: COLOR.loss,
  lostEc: COLOR.loss,
  new: COLOR.new,
  revived: COLOR.revived,
  returning: COLOR.returning,
  storeBuyer: COLOR.storeBuyer,
};

export const BRIDGE_LABEL: Record<BridgeKey, string> = {
  lostStudio: 'Studio firms that stopped',
  lostEc: 'EC firms that stopped',
  stayedStudioDown: 'Studio firms ordering less',
  stayedEcDown: 'EC firms ordering less',
  studioToEc: 'Studio firms now EC',
  stayedEcUp: 'EC firms ordering more',
  stayedStudioUp: 'Studio firms ordering more',
  ecToStudio: 'EC firms now Studio',
  new: 'New clients',
  revived: 'Revived clients',
  returning: 'Skipped the first month',
  storeBuyer: 'Store buyers now B2B',
  stayedStudio: 'Stayed Studio',
  stayedEc: 'Stayed EC Direct',
};

export const ENTRY_NODES: JourneyPath[] = ['revived', 'new', 'returning', 'storeBuyer'];

export const FIRM_PAGE = 25;

export const CATEGORY_ROWS = 10;
