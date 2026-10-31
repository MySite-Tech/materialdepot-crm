import { ClientContact, ClientEntity, ClientOrderMetrics, FirmStudioState, StudioAccess, StudioFirm, StudioLogin, StudioLogins } from '../../../types/client';
import { contactNumbers, normalizeContactNumber } from '../../utils/client';
import { gstNumbers } from '../rules/gst';

const compactName = (v: string | undefined) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const studioLoginOf = (c: ClientContact, logins: StudioLogins): StudioLogin | undefined => logins[normalizeContactNumber(c.number)];

export function studioAccessOf(c: ClientContact, logins: StudioLogins): StudioAccess | undefined {
  const l = studioLoginOf(c, logins);
  return l ? (l.power ? 'power' : 'non-power') : undefined;
}

function firmHoldingKeys(client: ClientEntity, firms: StudioFirm[]): StudioFirm | undefined {
  const phones = new Set(contactNumbers(client.contacts));
  const gsts = new Set(gstNumbers(client.gsts));
  return firms.find((f) => f.phones.some((p) => phones.has(p)) || f.gsts.some((g) => gsts.has(g)));
}

export function studioFirmOf(client: ClientEntity, firms: StudioFirm[]): StudioFirm | null {
  const name = compactName(client.company);
  return firmHoldingKeys(client, firms) ?? (name ? firms.find((f) => compactName(f.firmName) === name) : undefined) ?? null;
}

export function firmStudioAccess(client: ClientEntity, logins: StudioLogins, firms: StudioFirm[]): StudioAccess | undefined {
  const firm = studioFirmOf(client, firms);
  if (firm) return firm.power ? 'power' : 'non-power';
  const all = (client.contacts || []).map((c) => studioAccessOf(c, logins));
  return all.includes('power') ? 'power' : all.includes('non-power') ? 'non-power' : undefined;
}

export function firmStudioState(client: ClientEntity, logins: StudioLogins, firms: StudioFirm[]): FirmStudioState {
  const contacts = (client.contacts || []).filter((c) => normalizeContactNumber(c.number));
  const access = contacts.map((c) => studioAccessOf(c, logins));
  return {
    numbers: contacts.length,
    onboarded: access.filter(Boolean).length,
    power: access.filter((a) => a === 'power').length,
    unclassified: contacts.filter((c) => !String(c.label || '').trim()).length,
    firm: studioFirmOf(client, firms),
  };
}

export const studioFirmsNotInCrm = (clients: ClientEntity[], firms: StudioFirm[]): StudioFirm[] =>
  firms.filter((f) => !clients.some((c) => studioFirmOf(c, [f])));

export function withStudioOrders(metrics: ClientOrderMetrics, client: ClientEntity, firms: StudioFirm[]): ClientOrderMetrics {
  const held = new Set(contactNumbers(client.contacts));
  const extra = (firmHoldingKeys(client, firms)?.orders ?? []).filter((o) => !o.phone || !held.has(o.phone));
  if (!extra.length) return metrics;
  const studioRevenue = extra.reduce((sum, o) => sum + o.value, 0);
  const orders = (metrics.orders ?? 0) + extra.length;
  const totalRevenue = (metrics.totalRevenue ?? 0) + studioRevenue;
  const dates = [metrics.lastOrderPlaced, ...extra.map((o) => o.orderedOn)].filter((d): d is string => !!d);
  return {
    ...metrics,
    orders,
    totalRevenue,
    averageOrderValue: Math.round(totalRevenue / orders),
    lastOrderPlaced: dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : undefined,
    studioOrders: extra.length,
    studioRevenue,
    dateState: metrics.dateState === 'no-orders' || metrics.dateState === 'no-phone' ? 'ok' : metrics.dateState,
  };
}
