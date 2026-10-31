import { StudioLens } from './types';

export const PAGE_SIZE = 25;

export const STUDIO_ONBOARDING_TARGET_PCT = 25;

export const STUDIO_LENS: Record<StudioLens, { title: string; rule: string; empty: string; accent: string }> = {
  all:          { title: 'All firms', rule: 'Every firm in the Client Database that matches the search and KAM filter.', empty: 'No firm matches.', accent: '#1F2937' },
  onboarded:    { title: 'On Studio Space', rule: 'Matched to a firm on Studio Space by number, GST or exact name.', empty: 'No firm is on Studio Space yet.', accent: '#0F766E' },
  none:         { title: 'Not onboarded', rule: 'No firm on Studio Space matches by number, GST or exact name.', empty: 'Every firm is on Studio Space.', accent: '#9CA3AF' },
  nopower:      { title: 'No power user', rule: 'On Studio Space, but no login at the firm has the whole dashboard. Everyone there is a normal user, restricted to some tabs.', empty: 'Every onboarded firm has a power user.', accent: '#F59E0B' },
  unclassified: { title: 'Unclassified numbers', rule: 'At least one number at the firm has no classification (Owner, Designer, Purchase …).', empty: 'Every number is classified.', accent: '#DC2626' },
};

export const STUDIO_LENS_ORDER: StudioLens[] = ['all', 'onboarded', 'none', 'nopower', 'unclassified'];
