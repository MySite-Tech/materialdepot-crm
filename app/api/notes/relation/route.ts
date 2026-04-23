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
  const cacheKey = `notes-rel:${qs}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/notes/relation?${qs}`, {
      method: "GET",
      headers: { "api-key": apiKey, Accept: "application/json" },
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
