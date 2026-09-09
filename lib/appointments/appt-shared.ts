import type { AppUser } from '../../types/crm';

export const BRANCHES = ["JP Nagar", "Yelahanka", "Whitefield", "Gachibowli", "Kompally", "HSR", "Basaveshwar Nagar"] as const;

export type Branch = string;

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

const ALL_BRANCH_ROLES = new Set(["superadmin", "admin", "tech"]);

export function roleFromCrmRole(crmRole: string | undefined): Role {
  return CRM_ROLE_TO_APPT[crmRole ?? ""] ?? "presales";
}

export function resolveApptRole(user: AppUser | null | undefined): Role {
  return roleFromCrmRole(user?.role);
}

export function isApptAdmin(user: AppUser | null | undefined): boolean {
  return resolveApptRole(user) === "admin";
}

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

const NON_APPOINTMENT_BRANCHES = new Set(["hq", "headoffice", "corporate", "warehouse"]);

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

const BRANCH_ALIASES: Partial<Record<Branch, string[]>> = {
  Yelahanka: ["yelankha", "yelanka"],

  "Basaveshwar Nagar": ["basaveshwaranagar", "basaveshwarnagar"],
};

function sameBranch(crmName: string, branch: Branch): boolean {
  const na = crmName.toLowerCase().replace(/[^a-z]/g, "");
  if (!na) return false;
  const candidates = [branch.toLowerCase().replace(/[^a-z]/g, ""), ...(BRANCH_ALIASES[branch] ?? [])];
  return candidates.some((nb) => nb && (na.includes(nb) || nb.includes(na)));
}

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

export const LS = {
  BRANCH: "md_appt_branch",
} as const;

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
  convertedAt?: string | null;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ApptFeed = {
  leads: ApptLead[];

  fetchedAt: string;

  cached: boolean;

  stale?: boolean;
};

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
