import type { NextRequest } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

// Settings lead in Kylas — its cfResourceplanjson field holds both the resource
// plan AND the email→role access map as a single JSON blob:
//   { plan: {...}, access: {...} }
// (Old plans stored as a bare branch-map still read cleanly via the fallback below.)
const SETTINGS_LEAD_ID = "39871021";
const CONFIG_FIELD = "cfResourceplanjson";
const CACHE_KEY = `dashboard-config:${SETTINGS_LEAD_ID}`;

type StoredConfig = { plan?: unknown; access?: unknown };

// Parses the raw field value, tolerating the legacy shape (bare plan object).
function parseStored(raw: unknown): StoredConfig {
  if (typeof raw !== "string" || !raw.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    // New shape: has plan/access keys explicitly
    if ("plan" in p || "access" in p) {
      return { plan: p.plan ?? null, access: p.access ?? null };
    }
    // Legacy shape: whole object IS the plan
    return { plan: parsed, access: null };
  }
  return {};
}

async function fetchSettingsLead(apiKey: string) {
  const res = await rateLimitedFetch(`${KYLAS_API_BASE}/leads/${SETTINGS_LEAD_ID}`, {
    headers: { "api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// ── GET: return both plan + access ────────────────────────────
export async function GET() {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "KYLAS_API_KEY is not configured" }, { status: 500 });
  }

  const cached = getCached(CACHE_KEY) as { plan: unknown; access: unknown; raw: string | null } | null;
  if (cached) return Response.json(cached);

  try {
    const lead = await fetchSettingsLead(apiKey);
    const raw = lead?.customFieldValues?.[CONFIG_FIELD] ?? null;
    const parsed = parseStored(raw);
    const payload = {
      plan: parsed.plan ?? null,
      access: parsed.access ?? null,
      raw: typeof raw === "string" ? raw : null,
    };
    setCache(CACHE_KEY, payload, 30_000);
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 502 });
  }
}

// ── PUT: merge (plan and/or access) into stored config ────────
// Body: { plan?: {...}, access?: {...} }
// Missing keys are preserved from whatever's currently on the lead.
export async function PUT(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "KYLAS_API_KEY is not configured" }, { status: 500 });
  }

  let body: { plan?: unknown; access?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body must be JSON" }, { status: 400 }); }

  const providedPlan = "plan" in body;
  const providedAccess = "access" in body;
  if (!providedPlan && !providedAccess) {
    return Response.json({ error: "Body must include 'plan' and/or 'access'" }, { status: 400 });
  }

  try {
    // Read current state first so we can preserve the other half of the JSON
    const lead = await fetchSettingsLead(apiKey);
    const rawExisting = lead?.customFieldValues?.[CONFIG_FIELD] ?? null;
    const existing = parseStored(rawExisting);
    const merged: StoredConfig = {
      plan: providedPlan ? body.plan : existing.plan ?? null,
      access: providedAccess ? body.access : existing.access ?? null,
    };
    const raw = JSON.stringify(merged);
    if (raw.length > 60_000) {
      return Response.json({ error: `Config too large (${raw.length} bytes)` }, { status: 413 });
    }
    // Use "add" (not "replace") so the patch works whether the field has been
    // written before or not — Kylas rejects a replace when the path is missing.
    const patch = [{ op: "add", path: `/customFieldValues/${CONFIG_FIELD}`, value: raw }];
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/leads/${SETTINGS_LEAD_ID}`, {
      method: "PATCH",
      headers: { "api-key": apiKey, "Content-Type": "application/json-patch+json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }
    setCache(CACHE_KEY, { plan: merged.plan, access: merged.access, raw }, 30_000);
    return Response.json({ ok: true, savedAt: new Date().toISOString(), bytes: raw.length });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 502 });
  }
}
