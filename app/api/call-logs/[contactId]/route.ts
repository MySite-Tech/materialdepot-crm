import type { NextRequest } from "next/server";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/call-logs/[contactId]">
) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { contactId } = await context.params;
  const qs = request.nextUrl.searchParams.toString();
  const url = `${KYLAS_API_BASE}/call-logs/${contactId}${qs ? `?${qs}` : ""}`;

  try {
    const res = await rateLimitedFetch(url, {
      headers: { "api-key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
