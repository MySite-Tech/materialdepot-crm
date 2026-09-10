import { Availability, StaffCaps } from '../shared';
export interface AuditSkuRow {
  sku: string;
  name: string;
  link?: string;
}

export interface AuditOrder {
  id: string;
  pi: string;
  po: string[];
  skus: Array<{ c: string; n: string; audit?: boolean }>;
  auditTicked: any;

  storeCategories: string[];
  bm: string;
  bmEmail: string | null;
  name: string;
  phone: string;
  addr: string;
  status: string;
  service: AuditService | null;
  slot: string | null;
  date: string | null;
  auditor: string | null;
  auditorName: string | null;
  auditorEmail: string | null;
  shadowerEmail: string | null;
  shadowerName: string | null;
  city: string;
  log: AuditLogEntry[];
}

export interface Auditor extends Availability, StaffCaps {
  id: string;
  name: string;
  email: string;
  phone: string;
  zone: string;
  activeFrom: string | null;
  city: string;

  contact?: string | null;
}

export interface SlotDef { id: string; label: string }

export type AuditViewKey =
  | 'orders' | 'schedule' | 'reschedule' | 'followups' | 'calendar'
  | 'slots' | 'auditors' | 'deleted' | 'rectifications';

interface AuditService {
  flooring?: AuditSkuRow[];
  wallpaper?: AuditSkuRow[];
  follow_up_date?: string | null;
  rectification_of?: string;
  rectification_raised?: boolean;
  rectification_pi?: string;
  rectification_type?: 'audit' | 'install';
  issue?: string;
}

interface AuditLogEntry {
  t: string;
  d: string;
  by?: 'auto' | 'manual';
  who?: string;
}
