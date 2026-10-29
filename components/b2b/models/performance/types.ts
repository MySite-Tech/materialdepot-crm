import type { ClientEntity, ClientOrderMetrics } from '../client';
import type { InboundLead, OutreachLead } from '../mock-data';
import type { KamOrder } from '../kam';
import type { WaitlistSignup } from '../outreach';
import type { Period } from '../outreach/kpis';
import type { B2BTeam, TeamMember } from '@/lib/b2b/team/types';

export type PerfUnit = 'count' | '%' | 'L';

export interface PerfKpiDef {
  key: string;
  label: string;
  short: string;
  kind: 'Effort' | 'Output';
  unit: PerfUnit;
  target: number | null;
  per?: 'day' | 'month';
  daily: boolean;
  rule: string;
}

export interface PerfRow {
  id: string;
  title: string;
  note: string;
  at?: string;
  counts: boolean;
}

export interface PerfValue {
  value: number | null;
  unknown?: boolean;
  sub?: string;
  rows: PerfRow[];
}

export type PerfCard = Record<string, PerfValue>;

export interface Person {
  key: string;
  name: string;
  phone?: string;
  kylasUserId?: number | null;
  onTeam: boolean;
}

export type Source = 'inbound' | 'outreach' | 'clients' | 'kamOrders';

export interface PerfData {
  inbound: InboundLead[];
  outreach: OutreachLead[];
  clients: ClientEntity[];
  kamOrders: KamOrder[];
  failed: Source[];
  waitlist: Map<string, WaitlistSignup> | null;
  metricsFor: (c: ClientEntity) => ClientOrderMetrics;
  assigned?: Record<string, number | null>;
  members?: TeamMember[];
  today: string;
}

export interface TeamEngine {
  team: B2BTeam;
  label: string;
  sources: Source[];
  defs: PerfKpiDef[];
  notMeasured: string[];
  people: (data: PerfData, members: TeamMember[], live: boolean) => Person[];
  card: (data: PerfData, people: Person[], period: Period) => PerfCard;
}

export type Goals = Record<string, Record<string, number>>;

export interface TargetStore {
  monthlyTargetL: number;
  goals: Goals;
}

export interface DayRow {
  day: string;
  card: PerfCard;
}
