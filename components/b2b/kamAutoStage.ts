// ── KAM board auto-advance ────────────────────────────────────────────────────
// Moves an account's board column forward when its Django deal progresses:
// a cart is created → Quote Approval Pending, the order is placed → Order Placed.
//
// A created cart lands in Quote Approval Pending rather than a column of its own
// because that is genuinely the first status an estimate takes: the backend's
// forward path is quote_approval_pending → request_delivery_timeline →
// payment_pending → order_placed.
//
// Two rules make this safe to run on every board load:
//   1. Forward only. The board rank must strictly increase, so a human who has
//      dragged a card ahead of the cart never sees it yanked back.
//   2. Human-terminal stages are never touched. Closed and Lost are decisions,
//      not observations, so automation leaves them alone.

import { KAM_STAGES, type KamClient, type KamStage } from './mockData';

// Pipeline order of the board columns. Anything not listed is unranked and will
// not be auto-advanced away from by rank comparison.
const STAGE_RANK: Record<KamStage, number> = {
  'No Active Enquiry': 0,
  'Quote Approval Pending': 1,
  'PI Shared': 2,
  'Awaiting Payment': 3,
  'Order Placed': 4,
  'Closed': 5,
  'Lost': 6,
};

// Stages a human owns outright. Automation must not move a card out of these.
const TERMINAL_STAGES: KamStage[] = ['Closed', 'Lost'];

// Django CRM deal status → the board column it implies.
// Order Lost / Refunded / Order Cancelled are deliberately unmapped: losing an
// account is a judgement call, so the board is never auto-moved to Lost.
const STATUS_TO_STAGE: Record<string, KamStage> = {
  // A cart existing at all is the trigger for Quote Approval Pending.
  'In Cart': 'Quote Approval Pending',
  'Quote Approval Pending': 'Quote Approval Pending',
  'Availability Check': 'Quote Approval Pending',
  'Hold Stock': 'Awaiting Payment',
  // Order placed and everything downstream of it: the order exists, so the
  // account sits in Order Placed regardless of how far fulfilment has got.
  'Order Placed': 'Order Placed',
  'Order Confirmed': 'Order Placed',
  'Partly Shipped': 'Order Placed',
  'Shipped': 'Order Placed',
  'Partly Delivered': 'Order Placed',
  'Delivered': 'Order Placed',
};

export const stageForDealStatus = (status: string | null | undefined): KamStage | null =>
  (status && STATUS_TO_STAGE[status]) || null;

export interface StageAdvance {
  client: KamClient;
  from: KamStage;
  to: KamStage;
  trigger: string;      // the deal status that caused it
}

// Returns the advance this client needs, or null to leave it alone.
export function planAdvance(
  client: KamClient,
  furthestStatus: string | null | undefined,
): StageAdvance | null {
  const target = stageForDealStatus(furthestStatus);
  if (!target) return null;

  const current = client.stage;
  if (TERMINAL_STAGES.includes(current)) return null;

  const currentRank = STAGE_RANK[current];
  // An unrecognised stored stage has no rank; treat it as unranked and skip
  // rather than guessing where it sits in the pipeline.
  if (currentRank === undefined) return null;
  if (STAGE_RANK[target] <= currentRank) return null;

  return { client, from: current, to: target, trigger: furthestStatus as string };
}

export function planAdvances(
  clients: KamClient[],
  furthestStatusFor: (client: KamClient) => string | null | undefined,
): StageAdvance[] {
  return clients
    .map((c) => planAdvance(c, furthestStatusFor(c)))
    .filter((a): a is StageAdvance => a !== null);
}

// The advanced client, with an audit note so the move is visible on the card
// rather than looking like someone dragged it. Safe to persist: once the new
// stage is stored, the next load sees current === target and won't re-note.
export function applyAdvance(advance: StageAdvance): KamClient {
  return {
    ...advance.client,
    stage: advance.to,
    notes: [
      ...(advance.client.notes || []),
      {
        ts: 'just now',
        author: 'Automation',
        text: `Auto-advanced ${advance.from} → ${advance.to} (cart status: ${advance.trigger})`,
      },
    ],
  };
}

export const AUTO_STAGES: KamStage[] = KAM_STAGES.filter(
  (s) => Object.values(STATUS_TO_STAGE).includes(s),
);
