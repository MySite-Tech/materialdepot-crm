import {
  dealIsOrder,
  type KamOrder, type KamOrderStatus,
} from '.';

const STATUS_RANK: Record<KamOrderStatus, number> = {
  'Requirement Logged': 0,
  'Quote Shared': 1,
  'PI Shared': 2,
  'Closed': 3,
  'Lost': 3,
};

const TERMINAL: KamOrderStatus[] = ['Closed', 'Lost'];

const DEAL_STATUS_TO_ORDER_STATUS: Record<string, KamOrderStatus> = {

  'In Cart': 'Quote Shared',
  'Quote Approval Pending': 'Quote Shared',
  'Availability Check': 'Quote Shared',

  'Hold Stock': 'PI Shared',
};

function statusForDealStatus(dealStatus: string | null | undefined): KamOrderStatus | null {
  const s = String(dealStatus || '');
  if (!s) return null;

  if (dealIsOrder(s)) return 'Closed';
  return DEAL_STATUS_TO_ORDER_STATUS[s] ?? null;
}

interface StatusAdvance {
  order: KamOrder;
  from: KamOrderStatus;
  to: KamOrderStatus;

  trigger: string;
}

function planAdvance(order: KamOrder): StatusAdvance | null {

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
