import { ClientContact, ClientEntity, FirmStudioState, StudioAccess, StudioLogin, StudioLogins } from '../../../types/client';
import { normalizeContactNumber } from '../../utils/client';

export const studioLoginOf = (c: ClientContact, logins: StudioLogins): StudioLogin | undefined => logins[normalizeContactNumber(c.number)];

export function studioAccessOf(c: ClientContact, logins: StudioLogins): StudioAccess | undefined {
  const l = studioLoginOf(c, logins);
  return l ? (l.power ? 'power' : 'non-power') : undefined;
}

export function firmStudioAccess(client: ClientEntity, logins: StudioLogins): StudioAccess | undefined {
  const all = (client.contacts || []).map((c) => studioAccessOf(c, logins));
  return all.includes('power') ? 'power' : all.includes('non-power') ? 'non-power' : undefined;
}

export function firmStudioState(client: ClientEntity, logins: StudioLogins): FirmStudioState {
  const contacts = (client.contacts || []).filter((c) => normalizeContactNumber(c.number));
  const access = contacts.map((c) => studioAccessOf(c, logins));
  return {
    numbers: contacts.length,
    onboarded: access.filter(Boolean).length,
    power: access.filter((a) => a === 'power').length,
    unclassified: contacts.filter((c) => !String(c.label || '').trim()).length,
  };
}
