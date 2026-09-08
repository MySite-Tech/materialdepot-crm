// ── KAM Active Order auto-advance ─────────────────────────────────────────────
//
// Moves an order's status forward when the deal ticket behind its Enquiry ID
// progresses. The KAM PRD §5.1 says the order value is "auto-fetched from
// Procurement… in line with the Enquiry ID"; this is the same fetch, applied to
// the status as well, so a KAM does not have to re-type a closure the deal
// tickets already know about.
//
// Three rules make it safe to run on every board load:
//
//   1. Forward only. The rank must strictly increase, so a KAM who has moved an
//      order ahead of the ticket never sees it yanked back.
//   2. Human-terminal statuses are never touched. Closed and Lost are
//      decisions; automation leaves them alone.
//   3. It advances off the order's OWN ticket, matched by an exact Enquiry ID —
//      never off the client's furthest deal.
//
// Rule 3 is a correction, not a restatement. The previous version keyed on
// `furthestStatus` for the client's PHONE, which is a lifetime figure across
// every deal that client has ever raised. On a board where clients and orders
// were one row that was merely coarse; now that a client can hold several
// orders it is wrong — one closed order would advance every other open order on
// the same account to Closed. An order with no Enquiry ID is therefore left
// alone and the UI says so, because "no evidence" is not "no progress".
//
// It is also only safe at all because of the revenue rule in `kamModel.ts`: an
// order's `value` is the deal ticket's figure, never the KAM's estimate. The old
// board auto-advanced 16 live rows into a status whose `value` was a typed
// guess, which is why `analytics.ts` had to exclude that whole column from
// revenue to avoid reporting invented money.

import {
  KAM_ORDER_STATUSES, dealIsOrder,
  type KamOrder, type KamOrderStatus,
} from './kamModel';

const STATUS_RANK: Record<KamOrderStatus, number> = {
  'Requirement Logged': 0,
  'Quote Shared': 1,
  'PI Shared': 2,
  'Closed': 3,
  'Lost': 3,
};

/** Statuses a human owns outright. Automation must not move an order out of these. */
const TERMINAL: KamOrderStatus[] = ['Closed', 'Lost'];

// Django deal status → the PRD status it implies.
//
// Order Lost / Refunded / Order Cancelled are deliberately unmapped: losing an
// order is a judgement with a reason attached (§5.2 requires one), so nothing is
// ever auto-moved to Lost.
const DEAL_STATUS_TO_ORDER_STATUS: Record<string, KamOrderStatus> = {
  // A cart existing at all is what "quote shared" means on this backend: the
  // forward path is quote_approval_pending → request_delivery_timeline →
  // payment_pending → order_placed.
  'In Cart': 'Quote Shared',
  'Quote Approval Pending': 'Quote Shared',
  'Availability Check': 'Quote Shared',
  // Stock held against a proforma is a PI out with the money not yet in.
  'Hold Stock': 'PI Shared',
};

export function statusForDealStatus(dealStatus: string | null | undefined): KamOrderStatus | null {
  const s = String(dealStatus || '');
  if (!s) return null;
  // Everything from Order Placed downstream is §5.2's Closed — "once the order
  // is placed" — however far fulfilment has since travelled.
  if (dealIsOrder(s)) return 'Closed';
  return DEAL_STATUS_TO_ORDER_STATUS[s] ?? null;
}

export interface StatusAdvance {
  order: KamOrder;
  from: KamOrderStatus;
  to: KamOrderStatus;
  /** The deal status that caused it. */
  trigger: string;
}

/** The advance this order needs, or null to leave it alone. */
export function planAdvance(order: KamOrder): StatusAdvance | null {
  // No Enquiry ID means no ticket was matched, so there is no evidence at all.
  if (!String(order.enqId || '').trim()) return null;
  const target = statusForDealStatus(order.dealStatus);
  if (!target) return null;

  const current = order.status;
  if (TERMINAL.includes(current)) return null;

  const currentRank = STATUS_RANK[current];
  if (currentRank === undefined) return null;
  if (STATUS_RANK[target] <= currentRank) return null;

  return { order, from: current, to: target, trigger: String(order.dealStatus) };
}

export function planAdvances(orders: KamOrder[]): StatusAdvance[] {
  return orders
    .map(planAdvance)
    .filter((a): a is StatusAdvance => a !== null);
}

const noteText = (a: StatusAdvance) =>
  `Auto-advanced ${a.from} → ${a.to} (deal ticket ${a.order.enqId}: ${a.trigger})`;

/**
 * The advanced order, with an audit note so the move reads as automation rather
 * than as somebody dragging a card.
 *
 * The note is only appended when it is not ALREADY the last note. The previous
 * version reasoned that storing the new status made a repeat impossible, and
 * two live rows disprove it — `KAM-1787743441579-4` carries
 * "Auto-advanced PI Shared → Order Placed (cart status: Delivered)" twice,
 * because the write that would have stopped the second one was fire-and-forget
 * and its failure was invisible. Belt and braces: the caller now reports write
 * failures, and an identical consecutive note is not written again.
 */
export function applyAdvance(advance: StatusAdvance): KamOrder {
  const notes = advance.order.notes || [];
  const text = noteText(advance);
  const alreadyNoted = notes.length > 0 && notes[notes.length - 1].text === text;
  return {
    ...advance.order,
    status: advance.to,
    statusChangedAt: new Date().toISOString(),
    notes: alreadyNoted ? notes : [...notes, { ts: 'just now', author: 'Automation', text }],
  };
}

/** Statuses automation can reach, for a UI footnote. */
export const AUTO_STATUSES: KamOrderStatus[] = KAM_ORDER_STATUSES.filter((s) =>
  s === 'Closed' || Object.values(DEAL_STATUS_TO_ORDER_STATUS).includes(s));
