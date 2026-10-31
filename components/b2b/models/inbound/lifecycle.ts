import { DEAL_ORDER_STATUSES, INBOUND_CLOSED_STATUSES } from '../../constants/inbound';
import { CallAttempt, FollowUpBucket, InboundStatus, OutreachReferral } from '../../types/inbound';
import { istToday } from '../../utils/inbound';
import { isCrmAddedLead } from './kylas';

export function followUpBucket(date: string | undefined, today = istToday()): FollowUpBucket {
  const d = String(date || '').slice(0, 10);
  if (!d) return 'none';
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

export function nextKamRoundRobin(
  kams: string[],
  currentLoad: Record<string, number>,
): string | undefined {
  if (!kams.length) return undefined;
  let best = kams[0];
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const k of kams) {
    const load = currentLoad[k] || 0;
    if (load < bestLoad) { best = k; bestLoad = load; }
  }
  return best;
}

interface LifecycleLead {
  stage: InboundStatus;
  enqId?: string;
  piSharedAt?: string;
  statusChangedAt?: string;
  callAttempts?: CallAttempt[];
  outreachReferral?: Partial<OutreachReferral>;
}

export const istDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(iso).slice(0, 10);
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

export const hasPi = (l: LifecycleLead): boolean =>
  l.stage === 'PI Shared' || !!l.piSharedAt
  || (INBOUND_CLOSED_STATUSES.includes(l.stage) && !!String(l.enqId || '').trim());

export const piDay = (l: LifecycleLead): string =>
  hasPi(l) ? istDay(l.piSharedAt || l.statusChangedAt) : '';

export const lastCallDay = (l: LifecycleLead): string => {
  const a = l.callAttempts || [];
  return a.length ? istDay(a[a.length - 1].at) : '';
};

export const sentToOutreach = (l: LifecycleLead): boolean => !!l.outreachReferral?.at;

export function withStatusStamps<T extends LifecycleLead>(before: LifecycleLead, after: T, now: string): T {
  if (after.stage === before.stage) return after;
  return {
    ...after,
    statusChangedAt: now,
    piSharedAt: after.stage === 'PI Shared' && !after.piSharedAt ? now : after.piSharedAt,
  };
}

export interface Spoc { name?: string; detail: string }

export interface ClientSpocs { inbound: Spoc; outreach: Spoc; kam: Spoc; ec: Spoc }

interface SpocOutreachRow {
  bm?: string;
  intake?: { acceptedAt?: string; rejectedAt?: string };
  handover?: { kam?: string; status?: string };
  kam?: string;
}

interface SpocDeal { status: string; assignedTo?: string; branch?: string; createdAt?: string; id: string }

export function clientSpocs(
  l: { id: string; owner?: string; outreachReferral?: Partial<OutreachReferral> },
  outreach: SpocOutreachRow | null,
  deals: SpocDeal[],
): ClientSpocs {
  const inbound: Spoc = { name: l.owner || undefined, detail: isCrmAddedLead(l) ? 'Owns the lead (added in the CRM)' : 'Owns the lead in Kylas' };
  let out: Spoc = { detail: l.outreachReferral?.at ? 'Sent — waiting in the Outreach pool' : 'Not sent to Outreach' };
  if (outreach?.bm) {
    out = {
      name: outreach.bm,
      detail: outreach.intake?.rejectedAt ? 'Rejected the lead' : outreach.intake?.acceptedAt ? 'Accepted the lead' : 'Assigned, not accepted yet',
    };
  }
  const kamName = outreach?.handover?.kam || outreach?.kam;
  const kam: Spoc = kamName
    ? { name: kamName, detail: outreach?.handover?.status ? `Handover ${outreach.handover.status.toLowerCase()}` : 'Assigned' }
    : { detail: 'Assigned by Outreach at handover' };
  const order = deals
    .filter((d) => DEAL_ORDER_STATUSES.includes(d.status) && d.assignedTo)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const ec: Spoc = order
    ? { name: order.assignedTo, detail: `BM on the last order, ${order.id}${order.branch ? ` · ${order.branch}` : ''}` }
    : { detail: 'No order at an EC yet' };
  return { inbound, outreach: out, kam, ec };
}
