import { OutreachLead } from '../../models/mock-data';
import { Rep } from '../../models/outreach/intake';
import { Reminder } from '../../models/outreach/reminders';
import type { DealCtx } from '@/lib/b2b/inbound-deals/types';

export interface OutreachScope {
  mode: 'team' | 'mine' | 'open';
  me: Rep;
  isManager: boolean;
  isKam: boolean;
  reps: Rep[];
  rotationReps: Rep[];
  kams: Rep[];
  notice: string | null;
  owns: (l: OutreachLead) => boolean;
}

export type SaveLead = (before: OutreachLead | null, after: OutreachLead) => Promise<string | null>;

export type WorkLens =
  | 'work' | 'meetings' | 'overdue' | 'due' | 'book'
  | 'deals' | 'cartOpen' | 'piOpen' | 'cartFollow' | 'piFollow'
  | 'other' | 'inbox' | 'handoff' | 'won' | 'lost'
  | 'action' | 'all' | 'yet' | 'fu' | 'quote' | 'pi'
  | 'signoff' | 'signed';

export interface LensRow {
  lead: OutreachLead;
  reminders: Reminder[];
  deal: DealCtx;
}

export interface LensGroup {
  title: string;
  head?: WorkLens;
  lenses: WorkLens[];
}

export type RangeKey = 'any' | 'today' | 'week' | 'last7' | 'last30' | 'month' | 'last-month' | 'custom';

export interface OutreachFilters {
  companyType: string;
  leadType: string;
  segment: string;
  source: string;
  search: string;
  onlyGaps: boolean;
}

export interface BmOption {
  rep: Rep;
  leads: number;
  onTeam: boolean;
}
