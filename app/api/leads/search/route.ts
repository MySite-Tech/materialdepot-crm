import type { NextRequest } from "next/server";
import { getCached, setCache, cleanup } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

// Proxy for POST /v1/search/lead — mirrors the deal-search route.
export async function POST(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "0";
  const size = searchParams.get("size") ?? "50";
  const sort = searchParams.get("sort") ?? "cfVisitScheduled,asc";

  const body = await request.json();

  cleanup();
  const cacheKey = `lead-search:${page}:${size}:${sort}:${JSON.stringify(body)}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const res = await rateLimitedFetch(
      `${KYLAS_API_BASE}/search/lead?page=${page}&size=${size}&sort=${encodeURIComponent(sort)}`,
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

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
