import { OutreachLead } from '../mock-data';
import { B2B_ROSTER } from '../roster';
import { OutreachHandover, completedMeetings } from '.';
import { normalisePhone } from '@/lib/org/utils';

export const HANDOVER_TAT_HOURS = 48;

const HOUR_MS = 3_600_000;

export const WHATSAPP_GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,}\/?$/;

export const isWhatsappGroupLink = (v: string | undefined): boolean =>
  WHATSAPP_GROUP_RE.test(String(v || '').trim());

export const isMobile = (v: string | undefined): boolean => /^[6-9]\d{9}$/.test(normalisePhone(v));

export const orderVerified = (l: Pick<OutreachLead, 'enqId' | 'orderValueSource'>): boolean =>
  !!String(l.enqId || '').trim() && l.orderValueSource === 'deal';

const HANDOVER_REQUIRED: { label: string; ok: (l: OutreachLead) => boolean }[] = [
  { label: 'WhatsApp group link (chat.whatsapp.com/…)', ok: (l) => isWhatsappGroupLink(l.whatsappGroupLink) },
  { label: 'Contact person',   ok: (l) => !!String(l.contactPerson || '').trim() },
  { label: '10-digit mobile',  ok: (l) => isMobile(l.phone) },
  { label: 'Segment',          ok: (l) => !!l.segment },
  { label: 'Client type',      ok: (l) => !!l.companyType },
  { label: 'Team size',        ok: (l) => !!l.teamSize },
  { label: 'Office address',   ok: (l) => !!String(l.officeAddress || '').trim() },
  { label: 'Project details (requirement)', ok: (l) => !!String(l.requirement || '').trim() },
  { label: 'At least one meeting held',     ok: (l) => completedMeetings(l.meetings).length > 0 },
];

export function handoverGateErrors(l: OutreachLead): string[] {
  if (l.status !== 'Closed') return ['Only a converted lead (first order placed) can be handed over.'];
  return HANDOVER_REQUIRED.filter((r) => !r.ok(l)).map((r) => r.label);
}

export function handoverPrompts(l: OutreachLead): string[] {
  const out: string[] = [];
  if (!orderVerified(l)) out.push('The first order is not fetched from its Enq ID yet — the KAM will not see an order value.');
  if (!String(l.gstNumber || '').trim()) out.push('No GST captured. Fine for a firm without one; otherwise add it.');
  if (!completedMeetings(l.meetings).some((m) => m.pin)) out.push('No meeting carries a live location pin.');
  return out;
}

export type HandoverState = 'not-converted' | 'ready' | 'pending' | 'overdue' | 'accepted' | 'rejected';

export const hoursSince = (iso: string | undefined, nowMs: number): number => {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? 0 : Math.max(0, (nowMs - t) / HOUR_MS);
};

export function handoverState(l: OutreachLead, nowMs: number): HandoverState {
  if (l.status !== 'Closed') return 'not-converted';
  const h = l.handover;
  if (!h) return 'ready';
  if (h.status === 'Accepted') return 'accepted';
  if (h.status === 'Rejected') return 'rejected';
  return hoursSince(h.sentAt, nowMs) > HANDOVER_TAT_HOURS ? 'overdue' : 'pending';
}

export const HANDOVER_STATE_LABEL: Record<HandoverState, string> = {
  'not-converted': 'Not converted',
  ready:    'Handover not sent',
  pending:  'Awaiting KAM sign-off',
  overdue:  `KAM sign-off over ${HANDOVER_TAT_HOURS}h`,
  accepted: 'Signed off by KAM',
  rejected: 'Rejected by KAM',
};

export const HANDOVER_STATE_COLOR: Record<HandoverState, string> = {
  'not-converted': '#9CA3AF',
  ready:    '#F59E0B',
  pending:  '#3B82F6',
  overdue:  '#EF4444',
  accepted: '#22C55E',
  rejected: '#EF4444',
};

export const signedOffWithinTat = (h: OutreachHandover | undefined): boolean =>
  !!h && h.status === 'Accepted' && !!h.respondedAt
  && (Date.parse(h.respondedAt) - Date.parse(h.sentAt)) / HOUR_MS <= HANDOVER_TAT_HOURS;

export function sendHandover(
  l: OutreachLead,
  kam: { name: string; phone?: string },
  by: string,
  at: string,
): OutreachLead {
  const handover: OutreachHandover = {
    kam: kam.name,
    kamPhone: kam.phone,
    whatsappGroupLink: String(l.whatsappGroupLink || '').trim(),
    sentAt: at,
    sentBy: by,
    status: 'Pending',
  };
  return { ...l, kam: kam.name, handover };
}

export function respondToHandover(
  l: OutreachLead,
  accept: boolean,
  by: string,
  at: string,
  reason?: string,
): OutreachLead {
  if (!l.handover) return l;
  return {
    ...l,
    handover: {
      ...l.handover,
      status: accept ? 'Accepted' : 'Rejected',
      respondedAt: at,
      respondedBy: by,
      rejectReason: accept ? undefined : String(reason || '').trim() || undefined,
    },
  };
}

export const isHandoverKam = (l: OutreachLead, viewer: { name: string; phone: string }): boolean => {
  const h = l.handover;
  if (!h) return false;
  if (h.kamPhone && viewer.phone) return normalisePhone(h.kamPhone) === normalisePhone(viewer.phone);
  return sameRep(h.kam, viewer.name);
};

const normName = (s: string | undefined) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

const FULL_NAMES = new Map(B2B_ROSTER.map((r) => [normName(r.name), normName(r.fullName)]));

const fullName = (s: string | undefined) => {
  const n = normName(s);
  return FULL_NAMES.get(n) ?? n;
};

export function sameRep(a: string | undefined, b: string | undefined): boolean {
  const x = fullName(a);
  const y = fullName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return long.startsWith(`${short} `);
}

export const liveRepName = (name: string, live: { name: string }[]): string =>
  live.find((r) => sameRep(r.name, name))?.name ?? name;

export function repNames(live: { name: string }[], stored: (string | undefined)[]): string[] {
  const names = live.map((r) => r.name);
  for (const n of stored) if (n && !names.some((x) => sameRep(x, n))) names.push(n);
  return [...new Set(names)].sort();
}

export const repOwns = (rep: { name: string; phone?: string }) => (l: OutreachLead): boolean => {
  const p = normalisePhone(l.bmPhone);
  return p.length === 10 && rep.phone ? p === normalisePhone(rep.phone) : sameRep(l.bm, rep.name);
};
