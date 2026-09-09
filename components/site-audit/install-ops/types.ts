export type SkuType = 'flooring' | 'wallpaper' | 'wallpanel' | 'install';

export type InstallCategory = 'flooring' | 'wallpaper' | 'wallpanel';

interface SkuItem {
  c: string;
  n: string;
  type: SkuType;
  audit?: boolean;
}

export interface ServiceSkuRow {
  sku: string;
  name: string;
  sqft: string;
  link?: string;

  rolls?: string;
  qty?: string;
}

interface ServiceData {
  flooring?: ServiceSkuRow[];
  wallpaper?: ServiceSkuRow[];
  wallpanel?: ServiceSkuRow[];
  audit_by?: 'material_depot' | 'customer' | null;
  follow_up_date?: string | null;
  rectification_raised?: boolean;
  rectification_pi?: string;
  rectification_type?: 'install' | 'audit';
  rectification_of?: string;
  issue?: string;
}

export interface Assignment {
  installer_id: string;
  installer_email?: string;
  installer_name?: string;
  mode: 'standard' | 'custom';
  date?: string | null;
  slots?: string[];
  dates?: string[];
  primary?: boolean;
  status?: string;
}

interface RoomEntry {

  v?: number;
  category?: string;
  name?: string;
  sku?: string;
  fields?: Record<string, string | number>;
  qty?: string;
  height?: string;
  width?: string;
  photos?: string[];
  photo?: string;
  comments?: string;
  notes?: string;
}

export interface JobCard {
  draft?: boolean;
  rooms?: RoomEntry[];
  sign?: { img: string; name: string; ratings?: { q1: number; q2: number; q3: number; comments?: string }; tcCategories?: string[] };
  installerSign?: { img: string; name: string };
}

export interface Subjob {
  id: string;
  type: InstallCategory;
  items: ServiceSkuRow[];
  date: string | null;
  slot: string | null;
  installer: string | null;
  installer_email: string | null;
  assignments: Assignment[];
  status: string;
  jobcard?: JobCard | null;

  shadower_email?: string | null;
  shadower_name?: string | null;

  deliveryDate?: string | null;
  originalDeliveryDate?: string | null;
  customWp?: boolean;
  customWpStage?: string | null;
  customWpMeta?: Record<string, any>;
}

interface LogEntry {
  t: string;
  d: string;
  by?: 'auto' | 'manual';
  who?: string;
  lat?: number;
  lng?: number;
  arrivalPhoto?: string;

  locOverride?: boolean;
}

export interface InstallOrder {
  city?: string;
  id: string | number | null;
  pi: string;
  po: string[];
  skus: SkuItem[];
  bm: string;
  name: string;
  phone: string;
  addr: string;
  matchedAudit: boolean;
  auditBy: string | null;
  deliveryDate: string | null;
  customWp: boolean;
  status: string;
  subjobs: Subjob[] | null;
  service: ServiceData | null;
  log: LogEntry[];
}

export interface Installer {
  id: string;
  name: string;
  email: string;
  type: InstallCategory;
  zone: string;
  phone: string;
  city?: string;

  contact?: string | null;

  weeklyOff?: number | null;
  leaveDates?: string[];

  activeFrom?: string | null;

  dailyCap?: number | null;
  capOverrides?: Record<string, number>;
}

export interface SlotDef {
  id: string;
  label: string;
}

export type ViewKey =
  | 'orders'
  | 'needaction'
  | 'calls'
  | 'schedule'
  | 'reschedule'
  | 'followups'
  | 'calendar'
  | 'slots'
  | 'installers'
  | 'foam'
  | 'payouts'
  | 'deleted'
  | 'rectifications';

export interface FoamLedgerRow {
  id: string;
  installer_id?: string | null;
  installer_email?: string | null;
  installer_name?: string | null;
  sqft: number | string;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface FoamConfig {
  threshold: number;
  tracking_start: string;
}

export interface PayRates {
  fl_sqft?: number | null;
  wp_std_roll?: number | null;
  wp_custom_sqft?: number | null;
  wpnl_sqft?: number | null;
}

export const SM_ATTRIBUTION = 'Service Manager (CRM)';
