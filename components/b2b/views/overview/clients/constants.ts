import type { FlowFrom, FlowSide } from '@/lib/b2b/revenue';
import type { FlowRowDef } from './types';

export const SIDE_LABEL: Record<FlowSide, string> = { studio: 'Studio', ec: 'EC' };

export const FROM_LABEL: Record<FlowFrom, string> = {
  new: 'New',
  revived: 'Revived',
  earlier: 'Earlier client',
  studio: 'Studio',
  ec: 'EC',
  retail: 'Store buyer',
};

export const SIDE_COLOR: Record<FlowSide, string> = { studio: '#4F46E5', ec: '#0891B2' };

export const FLOW_ROWS: FlowRowDef[] = [
  { key: 'all', group: 'ordering', label: 'Clients ordering', hint: 'Every client with a B2B order this month, in any of the four channels.', split: true, pick: () => true },
  { key: 'new', group: 'ordering', label: 'New clients', hint: 'No order with Material Depot, on any branch, in the 12 months before. A first-ever order counts here too.', split: true, pick: (c) => c.from === 'new' },
  { key: 'revived', group: 'ordering', label: 'Revived', hint: 'Back after 3 or more months with no order, having ordered within the 12 months before.', split: true, pick: (c) => c.from === 'revived' },
  { key: 'earlier', group: 'ordering', label: 'Earlier client, gap unknown', hint: 'First ordered more than 12 months ago and not since April 2026. Django cannot date orders before April 2026, so this is either revived or new by the 12-month rule. It shrinks every month and is empty from April 2027.', split: true, pick: (c) => c.from === 'earlier' },
  { key: 'studio-studio', group: 'moved', label: 'Studio → Studio', hint: 'Ordered through Studio Sales last time and again this month.', split: false, pick: (c) => c.from === 'studio' && c.side === 'studio' },
  { key: 'ec-studio', group: 'moved', label: 'EC → Studio', hint: 'Last ordered at a store on their own (EC Direct), now through Studio Sales.', split: false, pick: (c) => c.from === 'ec' && c.side === 'studio' },
  { key: 'ec-ec', group: 'moved', label: 'EC → EC', hint: 'Still ordering at a store on their own: their B2B tie-up has not started.', split: false, pick: (c) => c.from === 'ec' && c.side === 'ec' },
  { key: 'studio-ec', group: 'moved', label: 'Studio → EC', hint: 'Last ordered through Studio Sales, now only EC Direct. Rare by design: once a firm\'s B2B tie-up starts, its store orders stay Studio EC Redirected until it stops ordering.', split: false, pick: (c) => c.from === 'studio' && c.side === 'ec' },
  { key: 'retail', group: 'moved', label: 'Store buyer → B2B', hint: 'Ordered with Material Depot in the last 3 months, but not as a B2B client then (for example before they became a lead or firm).', split: true, pick: (c) => c.from === 'retail' },
];

export const GROUP_LABEL: Record<FlowRowDef['group'], string> = {
  ordering: 'This month',
  moved: 'Compared with their last order in the 3 months before',
};

export const PAGE_SIZE = 25;
