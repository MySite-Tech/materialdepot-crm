import { OutreachLead } from '../../models/mock-data';
import { Rep } from '../../models/outreach/intake';
import { KpiRow, OutreachKpiKey } from '../../models/outreach/kpis';
import { Reminder } from '../../models/outreach/reminders';

export interface OutreachScope {
  mode: 'team' | 'mine' | 'open';
  me: Rep;
  isManager: boolean;
  isKam: boolean;
  reps: Rep[];
  kams: Rep[];
  notice: string | null;
  owns: (l: OutreachLead) => boolean;
}

export type SaveLead = (before: OutreachLead | null, after: OutreachLead) => Promise<string | null>;

export type WorkLens =
  | 'action' | 'meetings' | 'followups' | 'inbox' | 'handoff'
  | 'all' | 'yet' | 'fu' | 'quote' | 'pi' | 'won' | 'lost'
  | 'signoff' | 'signed';

export type Lens = WorkLens | `kpi:${OutreachKpiKey}`;

export interface LensRow {
  lead: OutreachLead;
  reminders: Reminder[];
  kpi?: KpiRow;
}

export interface LensGroup {
  title: string;
  head?: WorkLens;
  lenses: WorkLens[];
  weight: number;
  flow?: boolean;
}

export type RangeKey = 'any' | 'today' | 'week' | 'last7' | 'last30' | 'month' | 'last-month' | 'custom';

export interface OutreachFilters {
  companyType: string;
  leadType: string;
  segment: string;
  source: string;
  added: RangeKey;
  addedFrom: string;
  addedTo: string;
  search: string;
  onlyGaps: boolean;
}

export interface BmOption {
  rep: Rep;
  leads: number;
  onTeam: boolean;
}
