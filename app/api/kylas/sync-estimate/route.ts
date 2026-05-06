import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = process.env.MD_BACKEND_TOKEN;
  const baseUrl = process.env.MD_BACKEND_URL || "https://api-dev.materialdepot.in";

  if (!token) {
    return Response.json({ error: "MD_BACKEND_TOKEN is not configured" }, { status: 500 });
  }

  const body = await request.json();

  try {
    const res = await fetch(`${baseUrl}/apiV1/kylas/sync-estimate/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
