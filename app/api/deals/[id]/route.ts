import type { NextRequest } from "next/server";
import { getCached, setCache, cleanup } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function GET(
  req: NextRequest,
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
  // `?fresh=1` bypasses the 30s cache. A caller that is about to compute a
  // json-patch from this value needs the deal as it is NOW — a cached copy is
  // the same class of stale-input bug as reading it off the search index.
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const cached = fresh ? null : getCached(cacheKey);
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
    // Through the limiter, same as GET. A raise can fire three calls in a row
    // (read, clear, set) and Kylas 429s well inside that: measured on
    // 2026-09-08, a bare back-to-back clear/set both came back 429. A 429 on
    // the clear is not a harmless retry — it lands between the two halves of
    // the re-raise and leaves the field empty.
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/deals/${id}`, {
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
