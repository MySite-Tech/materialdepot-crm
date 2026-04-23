import type { NextRequest } from "next/server";
import { rateLimitedFetch } from "@/lib/rateLimiter";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function POST(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));

  try {
    const res = await rateLimitedFetch(`${KYLAS_API_BASE}/notes/search`, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
