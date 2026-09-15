import type { NextRequest } from "next/server";
import { MD_API_BASE_URL } from "@/lib/api/core/config";

export const dynamic = "force-dynamic";

const MD_API_BASE = MD_API_BASE_URL;

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
