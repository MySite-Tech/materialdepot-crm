import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Proxies to the Django `SiteAuditInstallationPOListAPI` (order/views.py),
// which requires IsInternalOrgUser — the caller's CRM token is forwarded
// straight through. This is the real backend behind material-depot-site's
// Vercel rewrite `/api/pos` -> https://api-dev2.materialdepot.in/apiV1/site-audit-installation-pos/
// (see that repo's vercel.json). The Install Ops "Pending POs" overlay here
// calls this route instead of hitting the legacy app's rewrite directly.
const MD_API_BASE = process.env.MD_API_BASE_URL || "https://api.materialdepot.com/apiV1";

const PASSTHROUGH_PARAMS = ["type", "page_size", "search", "status", "page"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = new URL(`${MD_API_BASE}/site-audit-installation-pos/`);
  for (const key of PASSTHROUGH_PARAMS) {
    const val = searchParams.get(key);
    if (val) url.searchParams.set(key, val);
  }

  const authHeader = request.headers.get("authorization");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return Response.json({ results: [], count: 0, error: (data && data.detail) || `HTTP ${res.status}` }, { status: res.status });
    }
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch pending POs";
    return Response.json({ results: [], count: 0, error: message }, { status: 502 });
  }
}
