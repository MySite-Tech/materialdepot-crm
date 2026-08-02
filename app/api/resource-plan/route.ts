import type { NextRequest } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";
import { readPlan, writePlan, type RotaBranchData } from "@/lib/rotaPlan";
import { BRANCHES, type Branch } from "@/lib/appt-shared";

export const dynamic = "force-dynamic";

// ── Storage split ─────────────────────────────────────────────
// The PLAN now lives in Supabase (`rota_plan`, one row per branch). It used to
// share a JSON blob on a Kylas "settings lead" with the email→role ACCESS map;
// that layout lost data, because saving PUT the author's whole snapshot of all
// six branches and clobbered any branch someone else had edited meanwhile.
//
// The ACCESS half stays on Kylas and is still read here, untouched: nothing in
// the CRM uses it (roles come from `resolveApptRole(currentUser)`), but the
// standalone MD-Appointment-tracker app still signs users in with it and reads
// the same lead. Moving it would break that app's login.
const KYLAS_API_BASE = process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";
const SETTINGS_LEAD_ID = "39871021";
const CONFIG_FIELD = "cfResourceplanjson";
const ACCESS_CACHE_KEY = `dashboard-access:${SETTINGS_LEAD_ID}`;

/** Pulls just the access half out of the Kylas field, tolerating the legacy bare-plan shape. */
function parseAccess(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  return "access" in p ? p.access ?? null : null;
}

/**
 * Best-effort read of the access map. A Kylas outage must not take the rota
 * planner down with it, so failures degrade to null rather than throwing.
 */
async function fetchAccess(): Promise<unknown> {
  const cached = getCached(ACCESS_CACHE_KEY);
  if (cached !== null) return cached;

  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/leads/${SETTINGS_LEAD_ID}`, {
      headers: { "api-key": apiKey },
    });
    if (!res.ok) return null;
    const lead = await res.json();
    const access = parseAccess(lead?.customFieldValues?.[CONFIG_FIELD] ?? null);
    setCache(ACCESS_CACHE_KEY, access, 60_000);
    return access;
  } catch {
    return null;
  }
}

// ── GET: full plan (all branches) + access ────────────────────
export async function GET() {
  try {
    const [plan, access] = await Promise.all([readPlan(), fetchAccess()]);
    return Response.json({ plan, access });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 },
    );
  }
}

// ── PUT: write only the branches the caller actually sent ─────
// Body: { plan: { version: 2, branches: { "<branch>": {...} } } }
//
// Branches absent from the body are left alone, which is what stops one
// manager's save from wiping another branch. Sending all six is still valid
// and still writes all six — but the client no longer needs to.
export async function PUT(request: NextRequest) {
  let body: { plan?: unknown; branches?: unknown; updatedBy?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body must be JSON" }, { status: 400 }); }

  // Accept either { plan: { branches } } or a bare { branches } payload.
  const planLike = (body.plan ?? body) as { branches?: unknown } | undefined;
  const rawBranches = planLike?.branches;
  if (!rawBranches || typeof rawBranches !== "object") {
    return Response.json({ error: "Body must include 'plan.branches'" }, { status: 400 });
  }

  const partial: Partial<Record<Branch, RotaBranchData>> = {};
  const unknownBranches: string[] = [];
  for (const [name, data] of Object.entries(rawBranches as Record<string, unknown>)) {
    if (!(BRANCHES as readonly string[]).includes(name)) { unknownBranches.push(name); continue; }
    if (!data || typeof data !== "object") continue;
    const d = data as Partial<RotaBranchData>;
    partial[name as Branch] = {
      members: Array.isArray(d.members)
        ? d.members.filter((m) => !!m && typeof m.id === "string" && typeof m.name === "string")
        : [],
      weeks: d.weeks && typeof d.weeks === "object" ? d.weeks : {},
    };
  }

  if (Object.keys(partial).length === 0) {
    return Response.json(
      { error: `No known branches in payload${unknownBranches.length ? ` (saw: ${unknownBranches.join(", ")})` : ""}` },
      { status: 400 },
    );
  }

  try {
    const written = await writePlan(partial, body.updatedBy);
    return Response.json({
      ok: true,
      savedAt: new Date().toISOString(),
      branches: written,
      ...(unknownBranches.length ? { ignored: unknownBranches } : {}),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 502 },
    );
  }
}
