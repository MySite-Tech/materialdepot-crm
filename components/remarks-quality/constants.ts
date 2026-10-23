import type { Filters, Thresholds } from './types';

export const PAGE_SIZE = 25;
export const SEARCH_TEXT_CAP = 6000;
export const WALKIN_DAYS = 35;
export const HEATMAP_DAYS = 31;
export const SCORECARD_STRIP_DAYS = 14;
export const DEFAULT_THRESHOLDS: Thresholds = [10, 50, 100];
export const DEFAULT_BM_RANK_MIN = 5;

export const PNAME = ['Need', 'Stuck', 'Who', 'Next + date'] as const;
export const PDESC = [
  'What the customer wants: product, room, sqft/qty',
  'What is stopping the order: price, stock, design, family, site not ready…',
  'Who came and who decides: husband, wife, architect, carpenter…',
  'One clear action with a date or time-frame: "call Thu", "visit next week", "in 3 days"',
];
export const BNAME = ['Nothing', 'Minimal', 'Sufficient', 'Detailed'] as const;

export const STATUS_LABEL: Record<string, string> = {
  in_cart: 'In Cart', quote_approval_pending: 'Quote Approval Pending', availability_check: 'Availability Check',
  payment_pending: 'Payment Pending', order_placed: 'Order Placed', order_confirmed: 'Order Confirmed',
  partly_shipped: 'Partly Shipped', shipped: 'Shipped', partly_delivered: 'Partly Delivered', delivered: 'Delivered',
  order_lost: 'Order Lost', order_cancelled: 'Order Cancelled', refunded: 'Refunded',
};
export const TYPE_LABEL: Record<string, string> = { deal: 'Deal', update_client_info_followup: 'Follow-up task' };

export const SCORE_COLORS = ['#DC2626', '#F97316', '#FBBF24', '#4ADE80', '#15803D'] as const;
export const BUCKET_COLORS = ['#DC2626', '#F97316', '#4ADE80', '#15803D'] as const;
export const COPY_COLOR = '#7C3AED';
export const INK = '#111827';
export const MUTED = '#9CA3AF';
export const BAR_IDLE = '#D1D5DB';
export const RANK_TOP = '#FBBF24';
export const RANK_LAST = '#FCA5A5';
export const HEAT_MID = '#FFFBEB';
export const HEAT_GOOD = '#16A34A';
export const COUNT_LOW = '#FEF3C7';
export const FLAG_BG = { copy: '#F5F3FF', bad: '#FEF2F2' } as const;
export const BUCKET_TAG = ['bg-red-50 text-red-700', 'bg-amber-50 text-amber-700', 'bg-green-50 text-green-700', 'bg-green-100 text-green-800'];

export const SKIPPED_CARD_BRANCHES = ['Unassigned', 'HQ'];

export const emptyFilters = (date: [string, string]): Filters => ({
  date, created: ['', ''], followup: ['', ''], closure: ['', ''],
  branch: [], rk: [], bm: [], owner: [], status: [], prio: [], type: [], cats: [],
  minVal: '', auto: false, lost: false, walk: false, copyNothing: false,
});
