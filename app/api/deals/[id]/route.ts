import type { NextRequest } from "next/server";
import { getCached, setCache, cleanup } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/deals/[id]">
) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  cleanup();
  const { id } = await ctx.params;
  const cacheKey = `deal:${id}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/deals/${id}`, {
      headers: { "api-key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    setCache(cacheKey, data, 30_000);
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/deals/[id]">
) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { id } = await ctx.params;
  const body = await request.json();

  try {
    const res = await fetch(`${KYLAS_API_BASE}/deals/${id}`, {
      method: "PATCH",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json-patch+json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    // Invalidate cache for this deal after update
    setCache(`deal:${id}`, data, 30_000);
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
