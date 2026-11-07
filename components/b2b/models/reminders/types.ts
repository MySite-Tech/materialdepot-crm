import type { ClientEntity } from '../../types/client';
import type { KamOrder } from '../../types/kam';
import type { InboundLead, OutreachLead } from '../mock-data';
import type { B2BTeam } from '@/lib/b2b/team/types';

export type ReminderKind = 'inbound' | 'outreach' | 'meeting' | 'firm' | 'pi';

export type ReminderState = 'later' | 'soon' | 'due' | 'today' | 'overdue';

export interface ReminderPerson {
  name: string;
  phone?: string;
  inboundKylasId?: number | null;
}

export interface Reminder {
  key: string;
  kind: ReminderKind;
  team: B2BTeam;
  openId?: string;
  company: string;
  contact?: string;
  phone?: string;
  context?: string;
  owner: string;
  date: string;
  time?: string;
  dueAt: number;
  owns: (p: ReminderPerson) => boolean;
}

export interface ReminderSources {
  inbound: InboundLead[];
  outreach: OutreachLead[];
  clients: ClientEntity[];
  orders: KamOrder[];
  inboundOwnerName: (kylasId: number | undefined) => string | undefined;
}
