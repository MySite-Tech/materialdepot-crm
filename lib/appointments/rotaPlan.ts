// Rota planner storage, backed by the `rota_plan` Supabase table.
//
// This used to live as a single JSON blob on Kylas lead 39871021's
// `cfResourceplanjson` field. That layout had a data-loss bug: the client PUT
// its whole snapshot of all six branches on every save, so a tab that had been
// open for a while would silently overwrite whatever other branches had changed
// since it loaded. One row per branch makes cross-branch clobbering impossible.
//
// Server-only: uses the service-role key, which bypasses RLS. Never import this
// from a client component.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BRANCHES, Branch, isValidBranchName } from "./appt-shared";

export type RotaMember = { id: string; name: string };
export type RotaBranchData = { members: RotaMember[]; weeks: Record<string, Record<string, string>> };
export type RotaPlan = { version: 2; branches: Record<Branch, RotaBranchData> };

const TABLE = "rota_plan";

let _admin: SupabaseClient | null = null;

/**
 * Service-role client. The anon key is deliberately not accepted as a fallback:
 * it ships to the browser, so allowing it here would mean any visitor could
 * rewrite every branch's roster.
 */
function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export function emptyBranchData(): RotaBranchData {
  return { members: [], weeks: {} };
}

export function emptyPlan(): RotaPlan {
  const branches = {} as Record<Branch, RotaBranchData>;
  for (const b of BRANCHES) branches[b] = emptyBranchData();
  return { version: 2, branches };
}

type Row = {
  branch: string;
  members: RotaMember[] | null;
  weeks: Record<string, Record<string, string>> | null;
};

/** Read every branch. Branches with no row yet come back empty, not missing. */
export async function readPlan(): Promise<RotaPlan> {
  const { data, error } = await admin().from(TABLE).select("branch, members, weeks");
  if (error) throw new Error(error.message);

  const plan = emptyPlan();
  for (const row of (data ?? []) as Row[]) {
    // The branch list is CRM data now (see appt-shared), so a stored row for a
    // branch this build's seed list has never heard of is still that branch's
    // roster — return it rather than silently dropping it.
    if (!isValidBranchName(row.branch)) continue;
    plan.branches[row.branch as Branch] = {
      members: Array.isArray(row.members) ? row.members : [],
      weeks: row.weeks && typeof row.weeks === "object" ? row.weeks : {},
    };
  }
  return plan;
}

/**
 * Write only the branches present in `partial`. A save from the Whitefield
 * manager touches the Whitefield row and nothing else, so concurrent edits to
 * other branches survive.
 */
export async function writePlan(
  partial: Partial<Record<Branch, RotaBranchData>>,
  updatedBy?: string,
): Promise<Branch[]> {
  const rows = (Object.entries(partial) as [Branch, RotaBranchData][])
    .filter(([b]) => isValidBranchName(b))
    .map(([branch, data]) => ({
      branch,
      members: Array.isArray(data?.members) ? data.members : [],
      weeks: data?.weeks && typeof data.weeks === "object" ? data.weeks : {},
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    }));

  if (rows.length === 0) return [];

  const { error } = await admin().from(TABLE).upsert(rows, { onConflict: "branch" });
  if (error) throw new Error(error.message);
  return rows.map((r) => r.branch as Branch);
}
