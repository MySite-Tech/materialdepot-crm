/* Data model for the Install Ops (Service Manager) view. Mirrors the shapes
   read/written by material-depot-site's app/src/pages/SMInstall.jsx against
   the `install_orders` / `install_orders_slim` tables — the same tables
   SiteInstallerApp.tsx (installer side) reads/writes. Kept loosely typed
   (jsonb blobs) to match that file's own pragmatic `any` usage rather than
   over-modeling columns neither app fully constrains. */

export type SkuType = 'flooring' | 'wallpaper' | 'install';

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
  name?: string;
  sku?: string;
  qty?: string;
  photos?: string[];
  photo?: string;
  comments?: string;
}

export interface JobCard {
  draft?: boolean;
  rooms?: RoomEntry[];
  sign?: { img: string; name: string; ratings?: { q1: number; q2: number; q3: number; comments?: string } };
}

export interface Subjob {
  id: string;
  type: 'flooring' | 'wallpaper';
  items: ServiceSkuRow[];
  date: string | null;
  slot: string | null;
  installer: string | null;
  installer_email: string | null;
  assignments: Assignment[];
  status: string;
  jobcard?: JobCard | null;
}

export interface LogEntry {
  t: string;
  d: string;
  by?: 'auto' | 'manual';
  who?: string;
  lat?: number;
  lng?: number;
  arrivalPhoto?: string;
}

export interface InstallOrder {
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
  type: 'flooring' | 'wallpaper';
  zone: string;
  phone: string;
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
  | 'deleted'
  | 'rectifications';

/* Attribution string used for `log.who` — this CRM view has no per-person
   session/impersonation (unlike the original's getSession()), so every
   write is attributed to a fixed label. Same deliberate deviation already
   made in SiteAuditStoreTeamView.tsx (`who: myStore` instead of a real
   logged-in user). */
export const SM_ATTRIBUTION = 'Service Manager (CRM)';
