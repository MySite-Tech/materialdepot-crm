import { ClientEntity, ClientEntityType } from '../../../types/client';
import { isValidContactNumber, normalizeContactNumber, primaryContact } from '../../utils/client';

export const PARTNER_FIRM_TYPE: Record<ClientEntityType, string | null> = {
  'Architect': 'architect',
  'Interior Designer': 'interior_designer',
  'Contractor': 'contractor',
  'Builder': 'builders',
  'End Consumer': null,
  'Other': null,
};

export const PARTNER_SOURCE: Record<string, string> = {
  Inbound: 'inbound',
  Outreach: 'outreach',
  Existing: 'existing_client',
};

export type PushSkipReason =
  | 'not-a-firm'
  | 'unknown-type'
  | 'no-phone'
  | 'shared-phone'
  | 'no-contact-person';

export interface PartnerPushRow {
  md_client_id: string;
  firm_name: string;
  contact_name: string;
  phone: string;
  email?: string;
  city?: string;
  gst?: string;
  firm_type: string;
  onboarding_source?: string;
}

export interface PushSkip {
  id: string;
  company: string;
  reason: PushSkipReason;
  detail?: string;
}

export interface PushPlan {
  rows: PartnerPushRow[];
  skipped: PushSkip[];
}

export const PUSH_SKIP_LABEL: Record<PushSkipReason, string> = {
  'not-a-firm': 'End consumers are not partner firms',
  'unknown-type': 'Client type is not set, so we cannot say whether this is a firm',
  'no-phone': 'No valid ten-digit contact number',
  'shared-phone': 'This number is on more than one client record — a person decides which firm it is',
  'no-contact-person': 'No contact person named on the primary number',
};

export function planPartnerPush(clients: ClientEntity[]): PushPlan {
  const byPhone = new Map<string, string[]>();
  for (const c of clients) {
    const phone = pushPhone(c);
    if (!phone) continue;
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), c.id]);
  }

  const rows: PartnerPushRow[] = [];
  const skipped: PushSkip[] = [];

  for (const c of clients) {
    const type = c.clientType;
    if (!type) {
      skipped.push({ id: c.id, company: c.company, reason: 'unknown-type' });
      continue;
    }

    const firmType = PARTNER_FIRM_TYPE[type];
    if (!firmType) {
      skipped.push({ id: c.id, company: c.company, reason: 'not-a-firm', detail: type });
      continue;
    }

    const phone = pushPhone(c);
    if (!phone) {
      skipped.push({ id: c.id, company: c.company, reason: 'no-phone' });
      continue;
    }

    const sharing = byPhone.get(phone) ?? [];
    if (sharing.length > 1) {
      skipped.push({
        id: c.id,
        company: c.company,
        reason: 'shared-phone',
        detail: `${phone} is on ${sharing.length} client records`,
      });
      continue;
    }

    const contact = primaryContact(c.contacts);
    const contactName = String(contact?.name ?? '').trim();
    if (!contactName) {
      skipped.push({ id: c.id, company: c.company, reason: 'no-contact-person' });
      continue;
    }

    const gst = c.gsts?.find((g) => g.number)?.number;
    rows.push({
      md_client_id: c.id,
      firm_name: c.company,
      contact_name: contactName,
      phone,
      ...(gst ? { gst } : {}),
      firm_type: firmType,
      ...(PARTNER_SOURCE[c.source] ? { onboarding_source: PARTNER_SOURCE[c.source] } : {}),
    });
  }

  return { rows, skipped };
}

function pushPhone(client: ClientEntity): string | null {
  const primary = primaryContact(client.contacts);
  if (!isValidContactNumber(primary?.number)) return null;
  return normalizeContactNumber(primary?.number);
}

export interface PartnerFirm {
  md_client_id: string;
  partner_id: string;
  firm_name: string;
  phone: string;
  has_login: boolean;
  referred_clients: number;
  orders_approved: number;
  value_approved: number;
  orders_pending: number;
}

export type PartnerLinkState = 'power' | 'provisioned' | 'none' | 'unknown';

export interface PartnerRoster {
  byClientId: Record<string, PartnerFirm>;
  loaded: boolean;
}

export const EMPTY_ROSTER: PartnerRoster = { byClientId: {}, loaded: false };

export function rosterFrom(firms: PartnerFirm[]): PartnerRoster {
  return {
    byClientId: Object.fromEntries(firms.map((f) => [f.md_client_id, f])),
    loaded: true,
  };
}

export function linkState(client: ClientEntity, roster: PartnerRoster): PartnerLinkState {
  if (!roster.loaded) return 'unknown';
  const firm = roster.byClientId[client.id];
  if (!firm) return 'none';
  return firm.has_login ? 'power' : 'provisioned';
}

export const LINK_STATE_LABEL: Record<PartnerLinkState, string> = {
  power: 'Power user',
  provisioned: 'Provisioned',
  none: 'Not on Studio Sales',
  unknown: 'Unknown',
};

export const LINK_STATE_COLOR: Record<PartnerLinkState, string> = {
  power: '#0F766E',
  provisioned: '#EAB308',
  none: '#9CA3AF',
  unknown: '#3B82F6',
};

export interface PartnerTotals {
  linked: number;
  powerUsers: number;
  provisioned: number;
  referralOrders: number;
  referralValue: number;
  pendingApproval: number;
  known: boolean;
}

export function partnerTotals(clients: ClientEntity[], roster: PartnerRoster): PartnerTotals {
  if (!roster.loaded) {
    return { linked: 0, powerUsers: 0, provisioned: 0, referralOrders: 0, referralValue: 0, pendingApproval: 0, known: false };
  }

  let linked = 0;
  let powerUsers = 0;
  let provisioned = 0;
  let referralOrders = 0;
  let referralValue = 0;
  let pendingApproval = 0;

  for (const c of clients) {
    const firm = roster.byClientId[c.id];
    if (!firm) continue;
    linked += 1;
    if (firm.has_login) powerUsers += 1;
    else provisioned += 1;
    referralOrders += firm.orders_approved;
    referralValue += firm.value_approved;
    pendingApproval += firm.orders_pending;
  }

  return { linked, powerUsers, provisioned, referralOrders, referralValue, pendingApproval, known: true };
}
