import { StudioLens } from './types';

export const PAGE_SIZE = 25;

export const STUDIO_ONBOARDING_TARGET_PCT = 25;

export const STUDIO_LENS: Record<StudioLens, { title: string; rule: string; empty: string; accent: string }> = {
  all:          { title: 'All firms', rule: 'Every firm in the Client Database that matches the search and KAM filter.', empty: 'No firm matches.', accent: '#1F2937' },
  onboarded:    { title: 'On Studio Space', rule: 'Matched to a firm on Studio Space by number, GST or exact name.', empty: 'No firm is on Studio Space yet.', accent: '#0F766E' },
  none:         { title: 'Not onboarded', rule: 'No firm on Studio Space matches by number, GST or exact name.', empty: 'Every firm is on Studio Space.', accent: '#9CA3AF' },
  power:        { title: 'Power users', rule: 'On Studio Space as a Power user: every tab, projects and moodboards included.', empty: 'No Power user firm yet.', accent: '#0F766E' },
  normal:       { title: 'Normal users', rule: 'On Studio Space as a Normal user: orders, clients and rewards only. Their KAM upgrades them to Power.', empty: 'No Normal user firm yet.', accent: '#6366F1' },
  unclassified: { title: 'Unclassified numbers', rule: 'At least one number at the firm has no classification (Owner, Designer, Purchase …).', empty: 'Every number is classified.', accent: '#DC2626' },
};

export const STUDIO_LENS_ORDER: StudioLens[] = ['all', 'onboarded', 'power', 'normal', 'none', 'unclassified'];
