/* Data model for the Install Ops (Service Manager) view. Mirrors the shapes
   read/written by material-depot-site's app/src/pages/SMInstall.jsx against
   the `install_orders` / `install_orders_slim` tables — the same tables
   SiteInstallerApp.tsx (installer side) reads/writes. Kept loosely typed
   (jsonb blobs) to match that file's own pragmatic `any` usage rather than
   over-modeling columns neither app fully constrains. */

/* Wall Panels ('wallpanel') is a full third installation track alongside flooring and wallpaper. */
export type SkuType = 'flooring' | 'wallpaper' | 'wallpanel' | 'install';

/* The three schedulable installation categories (excludes the 'install' service SKU itself). */
export type InstallCategory = 'flooring' | 'wallpaper' | 'wallpanel';

export interface SkuItem {
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
  /* legacy pre-sqft fields some old rows still carry */
  rolls?: string;
  qty?: string;
}

export interface ServiceData {
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

export interface RoomEntry {
  /* v2 install rooms carry {v:2,category,fields}; older rows carry the flat qty/height/width keys. */
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
  /* Comma-joined observers (any role, any number) — see parseShadowers. */
  shadower_email?: string | null;
  shadower_name?: string | null;
  /* Per-sub-job overrides that fall back to the order-level field until an SM
     diverges them (set when a category is split per-SKU). */
  deliveryDate?: string | null;
  originalDeliveryDate?: string | null;
  customWp?: boolean;
  customWpStage?: string | null;
  customWpMeta?: Record<string, any>;
}

export interface LogEntry {
  t: string;
  d: string;
  by?: 'auto' | 'manual';
  who?: string;
  lat?: number;
  lng?: number;
  arrivalPhoto?: string;
  /* Arrival recorded with no GPS fix, by either field app. */
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
  /* profiles.contact — the bridge to their CRM login, needed to deactivate it
     when they are removed. `phone` above is legacy free text the roster has
     never filled in. */
  contact?: string | null;
  /* profiles.weekly_off (0=Sun) / profiles.leave_dates — advisory at
     assignment time (the SM can override with a logged reason). */
  weeklyOff?: number | null;
  leaveDates?: string[];
  /* profiles.active_from — a future date means they start taking jobs then.
     Auditors have always had this; installers did not, so a new hire counted
     towards capacity from the day their profile was created. */
  activeFrom?: string | null;
  /* profiles.daily_cap / profiles.cap_overrides — the SM's per-installer,
     per-day override of the per-type constant (FLOOR_DAY_CAP / WP_DAY_SLOTS /
     WALLPANEL_DAY_CAP). NULL/absent = keep using the constant, so nothing
     changes until an SM sets a number. */
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

/* Rows of `foam_ledger` — every foam hand-out to a flooring installer.
   Balance = Σ issued here − Σ consumed (derived from completed/partial
   flooring jobs), so this table only ever grows. */
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

/* Per-sqft / per-roll payout rates. The global default lives in
   `app_settings.payout_rates`; `profiles.pay_rates` overrides it per
   installer (blank fields fall back to the global rate). */
export interface PayRates {
  fl_sqft?: number | null;
  wp_std_roll?: number | null;
  wp_custom_sqft?: number | null;
  wpnl_sqft?: number | null;
}

/* Attribution string used for `log.who` — this CRM view has no per-person
   session/impersonation (unlike the original's getSession()), so every
   write is attributed to a fixed label. Same deliberate deviation already
   made in SiteAuditStoreTeamView.tsx (`who: myStore` instead of a real
   logged-in user). */
export const SM_ATTRIBUTION = 'Service Manager (CRM)';
