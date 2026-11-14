import type { ClientEntity, ClientOrderMetrics } from '../client';
import type { InboundLead, OutreachLead } from '../mock-data';
import type { KamOrder } from '../kam';
import type { WaitlistSignup } from '../outreach';
import type { Period } from '../outreach/kpis';
import type { B2BTeam, TeamMember } from '@/lib/b2b/team/types';
import type { OrderCredit, RevenueChannel, RevenueOrder } from '@/lib/b2b/revenue';
import type { EcVisit } from '@/lib/b2b/ec-visits';

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
  weight?: number;
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
  den?: number;
  unknown?: boolean;
  sub?: string;
  rows: PerfRow[];
  orders?: RevenueOrder[];
  channels?: Record<RevenueChannel, number>;
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
  revenue: RevenueOrder[] | null;
  revenueWindow: Period | null;
  credits: Map<string, OrderCredit> | null;
  redirects: EcVisit[] | null;
}

export type ActivityKind = 'Call' | 'Meeting' | 'Note' | 'EC redirect' | 'Sent to Outreach' | 'Lead update' | 'Enquiry';

export interface ActivityItem {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail: string;
}

export interface TeamEngine {
  team: B2BTeam;
  label: string;
  sources: Source[];
  defs: PerfKpiDef[];
  notMeasured: string[];
  people: (data: PerfData, members: TeamMember[], live: boolean) => Person[];
  card: (data: PerfData, people: Person[], period: Period) => PerfCard;
  activity: (data: PerfData, people: Person[], period: Period, card: PerfCard) => ActivityItem[];
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
