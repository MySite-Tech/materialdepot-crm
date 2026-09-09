import type { NextRequest } from "next/server";
import { getCached, setCache } from "@/lib/server/cache";
import { rateLimitedFetch } from "@/lib/server/rateLimiter";
import { readPlan, writePlan, type RotaBranchData } from "@/lib/appointments/rotaPlan";
import { isValidBranchName, type Branch } from "@/lib/appointments/appt-shared";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE = process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";
const SETTINGS_LEAD_ID = "39871021";
const CONFIG_FIELD = "cfResourceplanjson";
const ACCESS_CACHE_KEY = `dashboard-access:${SETTINGS_LEAD_ID}`;

function parseAccess(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  return "access" in p ? p.access ?? null : null;
}

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

export async function PUT(request: NextRequest) {
  let body: { plan?: unknown; branches?: unknown; updatedBy?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body must be JSON" }, { status: 400 }); }

  const planLike = (body.plan ?? body) as { branches?: unknown } | undefined;
  const rawBranches = planLike?.branches;
  if (!rawBranches || typeof rawBranches !== "object") {
    return Response.json({ error: "Body must include 'plan.branches'" }, { status: 400 });
  }

  const partial: Partial<Record<Branch, RotaBranchData>> = {};
  const unknownBranches: string[] = [];
  for (const [name, data] of Object.entries(rawBranches as Record<string, unknown>)) {

    if (!isValidBranchName(name)) { unknownBranches.push(name); continue; }
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
