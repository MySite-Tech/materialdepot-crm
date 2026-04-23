import type { NextRequest } from "next/server";
import { getCached, setCache, cleanup } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function GET(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  cleanup();
  const qs = request.nextUrl.searchParams.toString();
  const cacheKey = `call-logs:${qs}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  const upstream = new URL(`${KYLAS_API_BASE}/call-logs`);
  request.nextUrl.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  try {
    const res = await rateLimitedFetch(upstream.toString(), {
      headers: { "api-key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    // Only cache if content is non-empty
    if (data.content?.length > 0) setCache(cacheKey, data, 60_000);
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
