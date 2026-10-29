import { ClientContact, ClientEntity, FirmStudioState } from '../../../types/client';
import { normalizeContactNumber } from '../../utils/client';

export const isOnboarded = (c: ClientContact): boolean => !!c.studioAccess;

export function firmStudioState(client: ClientEntity): FirmStudioState {
  const contacts = (client.contacts || []).filter((c) => normalizeContactNumber(c.number));
  return {
    numbers: contacts.length,
    onboarded: contacts.filter(isOnboarded).length,
    power: contacts.filter((c) => c.studioAccess === 'power').length,
    unclassified: contacts.filter((c) => !String(c.label || '').trim()).length,
  };
}
