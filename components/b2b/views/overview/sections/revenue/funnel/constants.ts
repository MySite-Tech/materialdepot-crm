import type { FunnelBucket, FunnelStage } from '@/lib/b2b/revenue';

export const FUNNEL_META: Record<FunnelBucket, { label: string; color: string; rule: string }> = {
  ecDirect: {
    label: 'EC direct',
    color: '#6B7280',
    rule: 'A store rep on the cart. No KAM on the firm, and no Inbound or Outreach lead or logged SPoC on its numbers.',
  },
  ecReferred: {
    label: 'EC referred',
    color: '#DB2777',
    rule: 'A store rep on the cart, and B2B is on the firm: a KAM, an Inbound or Outreach lead or logged SPoC from before the cart, a Studio Space number, or a logged redirect to an EC.',
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
