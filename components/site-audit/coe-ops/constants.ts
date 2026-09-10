import { BucketKey, Checkpoint, DatePresetKey, InstallReviewBucketKey } from './types';

export const AUDIT_COLS = 'id,pi,po,skus,bm,bm_email,customer_name,phone,addr,status,service,slot,date,auditor_name,auditor_email,created_at,city,coe_track';

export const INSTALL_COLS = 'id,pi,po,phone,customer_name,addr,bm,created_at,status,custom_wp,delivery_date,subjobs,log';

export const CHECKPOINTS: Checkpoint[] = [
  { k: 'd1', days: 1, label: 'D+1 · Client audit review', who: 'client', always: true, hint: 'Call the client for their review of the site audit.' },
  { k: 'd3', days: 3, label: 'D+3 · BM update (no cart yet)', who: 'bm', always: false, hint: 'No new cart in 3 days — ask the BM why.' },
  { k: 'd14', days: 14, label: 'D+14 · BM + client update', who: 'both', always: false, hint: 'No material/installation order after 14 days — take an update from both the BM and the client.' },
];

export const OUTCOMES = [
  { k: 'reached', l: 'Spoke to them' },
  { k: 'no_reply', l: 'No reply / call not returned' },
  { k: 'not_picked', l: "Didn't pick the call" },
  { k: 'wrong_number', l: 'Wrong / unreachable number' },
];

export const BUCKETS: Array<{ k: BucketKey; l: string; cls: string }> = [
  { k: 'overdue', l: 'Overdue', cls: 's-red' },
  { k: 'today', l: 'Due today', cls: 's-amber' },
  { k: 'upcoming', l: 'Upcoming', cls: '' },
  { k: 'snoozed', l: 'Snoozed', cls: '' },
  { k: 'open', l: 'Awaiting outcome', cls: '' },
  { k: 'converted', l: 'Converted', cls: 's-green' },
  { k: 'lost', l: 'Lost / closed', cls: '' },
];

export const CAT_FLOORING = 'Wooden Flooring';

export const CAT_WALLPAPER = 'Wallpaper';

export const CAT_CUSTOM_WP = 'Custom Wallpaper';

const CAT_WALLPANEL = 'Wall Panels';

const CAT_CNC = 'CNC';

export const CAT_UNSET = 'Not recorded';

export const CATEGORY_ORDER = [CAT_FLOORING, CAT_WALLPAPER, CAT_CUSTOM_WP, CAT_WALLPANEL, CAT_CNC];

export const CATEGORY_TONE: Record<string, string> = {
  [CAT_FLOORING]: '', [CAT_WALLPAPER]: 'wp', [CAT_CUSTOM_WP]: 'cwp',
  [CAT_WALLPANEL]: 'wpl', [CAT_CNC]: 'cnc',
};

export const TICKED_LIST_LABELS: Record<string, string> = {
  'wooden flooring': CAT_FLOORING, flooring: CAT_FLOORING, 'spc flooring': CAT_FLOORING,
  'standard wallpapers': CAT_WALLPAPER, 'standard wallpaper': CAT_WALLPAPER, wallpaper: CAT_WALLPAPER,
  'custom wallpapers': CAT_CUSTOM_WP, 'custom wallpaper': CAT_CUSTOM_WP, 'customized wallpaper': CAT_CUSTOM_WP,
  'wall panels': CAT_WALLPANEL, wallpanel: CAT_WALLPANEL, cnc: CAT_CNC,
};

export const TICKED_ROOM_LABELS: Record<string, string> = {
  flooring: CAT_FLOORING, wallpaper: CAT_WALLPAPER, wallpanel: CAT_WALLPANEL, cnc: CAT_CNC,
};

export const AUDIT_TICKED_QUERY = 'audit_orders?select=id,audit_ticked&status=eq.completed';

export const DATE_PRESETS: Array<{ k: DatePresetKey; l: string }> = [
  { k: 'all', l: 'All time' },
  { k: 'today', l: 'Today' },
  { k: 'last7', l: 'Last 7 days' },
  { k: 'last30', l: 'Last 30 days' },
  { k: 'last90', l: 'Last 90 days' },
  { k: 'thismonth', l: 'This month' },
  { k: 'lastmonth', l: 'Last month' },
];

export const RATING_COLS = 'order_type,order_id,pi,q1_score,q2_score,q3_score,created_at,staff_email';

export const PROJECTION_WINDOW_MS = 30 * 60 * 1000;

export const INSTALL_REVIEW_BUCKETS: Array<{ k: InstallReviewBucketKey; l: string; cls: string }> = [
  { k: 'overdue', l: 'Overdue', cls: 's-red' },
  { k: 'today', l: 'Due today', cls: 's-amber' },
  { k: 'upcoming', l: 'Upcoming', cls: '' },
  { k: 'done', l: 'Reviewed', cls: 's-green' },
];
