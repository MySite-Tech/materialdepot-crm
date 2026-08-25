// Shared types + fetch helpers for the Appointment Tracker (moved in from the
// standalone kylas-dashboard app, which the CRM used to embed as an iframe).
// Kept UI-free so both server routes and client components can import it.
//
// Identity note: the standalone app had its own email + access-list sign-in, and
// its own email -> role map stored on a Kylas lead. Inside the CRM none of that
// is needed -- the signed-in `AppUser` is the identity and its CRM role decides
// which tracker view the user lands on.

import type { AppUser } from '../types/crm';

// The branch list is fetched from the CRM's own branch table — the same
// `fetchBranchList()` ('/orgainsation-branch/') the Leads and Footfall tabs
// use, threaded in from App.tsx — so a store added there shows up here too.
// This list is only the seed/fallback for before that fetch lands (or if it
// fails). Each name must still match the corresponding option on Kylas's
// `companyBusinessType` picklist, or that branch's leads won't be found (see
// branchFrom here, and BRANCH_ENUM_VALUES in app/api/appointments/route.ts) —
// which is what apptBranchesFromCrm normalises the CRM's spellings back to.
export const BRANCHES = ["JP Nagar", "Yelahanka", "Whitefield", "Gachibowli", "Kompally", "HSR", "Basaveshwar Nagar"] as const;
/** A branch label. Not a closed union any more — the list is data, not code. */
export type Branch = string;

/** Reject junk before it reaches the rota table, now that any name is valid. */
export function isValidBranchName(name: unknown): name is Branch {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 64;
}

export const ROLES = [
  { key: "presales", label: "Presales" },
  { key: "receptionist", label: "Receptionist" },
  { key: "manager", label: "Store Manager" },
  { key: "admin", label: "Admin" },
] as const;
export type Role = (typeof ROLES)[number]["key"];

// ── Tracker role resolution ───────────────────────────────────
// Straight from the CRM role. Keys are the backend's `permission_name` values
// (UserPermission.permission_choices in MaterialDepotDjangoBackend). Note the
// stored value and its display label differ for some roles: 'retail' is labelled
// "Receptionist" and 'customer_success' is labelled "Consultants" — so 'retail'
// is the receptionist here, and consultants fall through to the presales view.
// The `crm.appointment_tracker` permission decides *whether* someone sees the
// tab; this decides which view they get once they're in.
const CRM_ROLE_TO_APPT: Record<string, Role> = {
  superadmin: "admin",
  admin: "admin",
  tech: "admin",
  manager: "manager",
  store_manager: "manager",
  retail: "receptionist",
  pre_sales: "presales",
  sales: "presales",
  post_sales: "presales",
};

/** Roles that always see every branch, regardless of their CRM branch list. */
const ALL_BRANCH_ROLES = new Set(["superadmin", "admin", "tech"]);

export function roleFromCrmRole(crmRole: string | undefined): Role {
  return CRM_ROLE_TO_APPT[crmRole ?? ""] ?? "presales";
}

export function resolveApptRole(user: AppUser | null | undefined): Role {
  return roleFromCrmRole(user?.role);
}

/** True when this user should see the tracker's admin-only screens. */
export function isApptAdmin(user: AppUser | null | undefined): boolean {
  return resolveApptRole(user) === "admin";
}

/**
 * EC branches this user may look at, out of `options` (the fetched branch list):
 *   1. admin-tier CRM roles -> all branches
 *   2. their CRM allowedBranches, fuzzy-matched to those ECs
 *   3. all branches -- a user whose CRM branches don't name an EC (or who has
 *      none set) still gets a usable tab rather than an empty dropdown.
 */
export function apptBranchesFor(
  user: AppUser | null | undefined,
  options: readonly Branch[] = BRANCHES,
): Branch[] {
  const all = options.length > 0 ? [...options] : [...BRANCHES];
  if (ALL_BRANCH_ROLES.has(user?.role ?? "") || isApptAdmin(user)) return all;
  const allowed = user?.allowedBranches ?? [];
  const matched = all.filter((b) => allowed.some((a) => sameBranch(a, b)));
  return matched.length > 0 ? matched : all;
}

// CRM branches that exist for HR/reporting but never take an appointment, so
// listing them would only ever offer an empty calendar.
const NON_APPOINTMENT_BRANCHES = new Set(["hq", "headoffice", "corporate", "warehouse"]);

/**
 * The CRM branch list (App.tsx's `branches`, from fetchBranchList()) turned into
 * tracker branches. CRM spellings aren't ours -- "JP Nagar EC", the long-standing
 * "Yelankha" misspelling -- so anything that names one of our ECs is normalised
 * back to that EC's spelling, which is what branchFrom and the Kylas enum match
 * on. A CRM branch that names no known EC is still offered under its own name,
 * so a newly-opened store appears here without a code change.
 *
 * Returns the seed list when given nothing, i.e. while the fetch is in flight
 * or after it failed -- never an empty dropdown.
 */
export function apptBranchesFromCrm(crmNames: readonly string[] | undefined | null): Branch[] {
  const out: Branch[] = [];
  for (const raw of crmNames ?? []) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    if (NON_APPOINTMENT_BRANCHES.has(name.toLowerCase().replace(/[^a-z]/g, ""))) continue;
    const canonical = BRANCHES.find((b) => sameBranch(name, b)) ?? name;
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out.length > 0 ? out : [...BRANCHES];
}

// CRM branch names aren't spelled identically to ours (suffixes like
// "JP Nagar EC", and the CRM's long-standing "Yelankha" misspelling), so each
// EC lists the normalized spellings it should also answer to.
const BRANCH_ALIASES: Partial<Record<Branch, string[]>> = {
  Yelahanka: ["yelankha", "yelanka"],
  // Kylas spells it "Basaveshwar Nagar", the CRM/branch table "Basaveshwara".
  "Basaveshwar Nagar": ["basaveshwaranagar", "basaveshwarnagar"],
};

/** Loose branch-name compare — tolerates suffixes and known misspellings. */
function sameBranch(crmName: string, branch: Branch): boolean {
  const na = crmName.toLowerCase().replace(/[^a-z]/g, "");
  if (!na) return false;
  const candidates = [branch.toLowerCase().replace(/[^a-z]/g, ""), ...(BRANCH_ALIASES[branch] ?? [])];
  return candidates.some((nb) => nb && (na.includes(nb) || nb.includes(na)));
}

// Resolve a lead's `companyBusinessType` value to one of our BRANCHES.
// Kylas stores it as the raw enum key (e.g. "jp_nagar_ec", "yelahanka_ec"),
// so we strip non-letters on both sides before substring-matching.
export function branchFrom(
  companyBusinessType: unknown,
  branches: readonly Branch[] = BRANCHES,
): Branch | null {
  const raw = typeof companyBusinessType === "string"
    ? companyBusinessType
    : (companyBusinessType as { name?: string } | null)?.name ?? "";
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return null;
  return branches.find((b) => normalized.includes(b.toLowerCase().replace(/[^a-z]/g, ""))) ?? null;
}

// localStorage keys — only the last-viewed branch is remembered now that
// identity comes from the CRM session.
export const LS = {
  BRANCH: "md_appt_branch",
} as const;

// ── Appointment leads ─────────────────────────────────────────
// Shared by the tracker views and the admin overview — the standalone app kept
// two copies of this fetch that had already drifted apart on their field lists.

interface CustomFieldOption { id?: string | number; name?: string }
type FieldValue = string | number | boolean | CustomFieldOption[] | Record<string, unknown> | null;

export interface ApptLead {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { value?: string; type?: string }[];
  emails?: { value?: string }[];
  requirementName?: string | null;
  companyBusinessType?: CustomFieldOption | string | null;
  companyWebsite?: string | null;
  cfVisitScheduled?: string | null;
  customFieldValues?: Record<string, FieldValue>;
  ownedBy?: { id?: number; name?: string };
  convertedAt?: string | null; // Kylas sets this when lead → deal conversion happens
}

/** Local-timezone YYYY-MM-DD. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ApptFeed = {
  leads: ApptLead[];
  /** ISO timestamp of the sweep this data came from. */
  fetchedAt: string;
  /** True when served from the server's cache rather than a fresh sweep. */
  cached: boolean;
  /** True when a sweep failed and the last good copy was served instead. */
  stale?: boolean;
};

/**
 * Every EC lead with a `cfVisitScheduled` set, across all branches — one request
 * to our own /api/appointments, which owns the Kylas paging and caches the
 * result server-side for all users. Callers slice by branch and date window
 * themselves, so changing either must NOT call this again.
 *
 * `force` bypasses the server cache — wire it to an explicit Refresh only.
 */
export async function fetchApptFeed(force = false): Promise<ApptFeed> {
  const res = await fetch(`/api/appointments${force ? "?refresh=1" : ""}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return {
    leads: (data.leads ?? []) as ApptLead[],
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    cached: !!data.cached,
    stale: !!data.stale,
  };
}

// ── EC Ready store (localStorage) ─────────────────────────────
// Persisted per-lead: { leadId: { state: 'ready' | 'not_ready', by: string, at: ISO } }
export type EcReadyEntry = { state: "ready" | "not_ready"; by: string; at: string };
export type EcReadyMap = Record<number, EcReadyEntry>;

export function loadEcReady(): EcReadyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("md_ec_ready");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveEcReady(m: EcReadyMap) {
  try { localStorage.setItem("md_ec_ready", JSON.stringify(m)); } catch { /* ignore */ }
}
