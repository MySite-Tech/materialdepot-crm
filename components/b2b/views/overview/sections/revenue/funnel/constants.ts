import type { FunnelBucket, FunnelStage } from '@/lib/b2b/revenue';

export const FUNNEL_META: Record<FunnelBucket, { label: string; color: string; rule: string }> = {
  ecDirect: {
    label: 'EC direct',
    color: '#6B7280',
    rule: 'A store rep on the cart, before the firm\'s B2B tie-up started: no B2B person had taken one of its orders, and it had no KAM, Inbound or Outreach lead or SPoC, logged redirect or Studio Space onboarding yet.',
  },
  ecReferred: {
    label: 'EC referred',
    color: '#DB2777',
    rule: 'A store rep on the cart, after the firm\'s B2B tie-up started: a B2B person had taken one of its orders, or it had a KAM, an Inbound or Outreach lead or SPoC, a logged redirect or Studio Space onboarding by then.',
  },
  studio: {
    label: 'Studio direct',
    color: '#4F46E5',
    rule: 'A B2B Inbound, Outreach or KAM rep on the cart, so the team booked it.',
  },
};

export const STAGE_META: Record<FunnelStage, { label: string; hint: string }> = {
  enquiry: { label: 'Carts raised', hint: 'Every cart raised in the month on a Client Database number, whatever its status now. A cart gets its ENQ ID when its quote is made, so one still In Cart shows its cart number (CT…).' },
  quoted: { label: 'Quote shared', hint: 'At Quote Approval Pending, Availability Check, Hold Stock or Payment Pending, or already an order.' },
  ordered: { label: 'Ordered', hint: 'Order Placed through Delivered. Lost and cancelled orders are not here.' },
  delivered: { label: 'Delivered', hint: 'Delivered or Partly Delivered.' },
  lost: { label: 'Lost', hint: 'Order Lost, Order Cancelled or Refunded. Not part of the steps above.' },
};

export const FUNNEL_OPEN_KEY = 'b2b-overview-funnel-open';
