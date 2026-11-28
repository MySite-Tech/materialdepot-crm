import type { ReferralStage } from '../types/kam';

export const REFERRAL_STAGE: Record<ReferralStage, { label: string; cls: string }> = {
  none:    { label: 'Not at an EC yet', cls: 'bg-red-50 text-red-700' },
  cart:    { label: 'Cart, no order', cls: 'bg-amber-50 text-amber-800' },
  ordered: { label: 'Ordered', cls: 'bg-emerald-50 text-emerald-700' },
  unknown: { label: 'Unknown', cls: 'bg-blue-50 text-blue-700' },
};

export const REFERRED_LENS = {
  title: 'Referred clients',
  rule: 'End clients that a firm or lead you are in touch with has referred. Not at an EC yet means no cart, PI or enquiry on their number, so ask whoever referred them. Cart, no order and Ordered follow their history in Django.',
  empty: 'No client has been referred from these leads yet. Add one from a lead’s Referred clients card.',
  accent: '#0EA5E9',
};
